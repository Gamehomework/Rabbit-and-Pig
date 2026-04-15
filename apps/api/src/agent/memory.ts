/**
 * Conversation memory management for the ReAct Agent.
 *
 * Responsibilities:
 *  - Persist user / assistant messages to `agent_messages` table
 *  - Load prior conversation history for a session
 *  - Trim history to a token budget (sliding window) before passing to the LLM
 *  - Manage session lifecycle: close, expire, cleanup
 *
 * Only user and assistant turn messages are persisted.
 * Tool call / tool result messages are ephemeral within a single run.
 */

import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Conservative token estimate: 4 characters ≈ 1 token.
 * Deliberately over-estimates to stay safely within context limits.
 */
const CHARS_PER_TOKEN = 4;

/**
 * Token budget reserved for history when assembling the message array.
 * Leaves ~30 k tokens for the system prompt, current query, and within-run
 * tool call growth (typically ≤ 20 k for 10 iterations × 2 tools).
 */
const DEFAULT_HISTORY_TOKEN_BUDGET = 60_000;

/** Default number of messages fetched from DB before token trimming. */
const DEFAULT_HISTORY_FETCH_LIMIT = 100;

/** Sessions older than this are marked "expired" during cleanup. */
const SESSION_TTL_HOURS = 24;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MemoryMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Persistence ────────────────────────────────────────────────────────────────

/**
 * Persist one or more user / assistant messages for a session.
 * Fire-and-forget safe: errors are swallowed so they never break a response.
 */
export async function saveMessages(
  sessionId: number,
  messages: MemoryMessage[],
): Promise<void> {
  if (messages.length === 0) return;
  await db.insert(schema.agentMessages).values(
    messages.map((m) => ({ sessionId, role: m.role, content: m.content })),
  );
}

/**
 * Load the conversation history for a session in chronological order.
 * Fetches the most recent `limit` rows so queries stay fast on long sessions.
 */
export async function loadHistory(
  sessionId: number,
  limit = DEFAULT_HISTORY_FETCH_LIMIT,
): Promise<ChatCompletionMessageParam[]> {
  // Fetch newest-first then reverse so the array is chronological
  const rows = await db
    .select()
    .from(schema.agentMessages)
    .where(eq(schema.agentMessages.sessionId, sessionId))
    .orderBy(sql`${schema.agentMessages.createdAt} DESC`)
    .limit(limit);

  return rows.reverse().map((row) => ({
    role: row.role as "user" | "assistant",
    content: row.content,
  }));
}

// ── Token budget ───────────────────────────────────────────────────────────────

/**
 * Estimate the token cost of a single message.
 * Adds 4 tokens per message for role / formatting overhead.
 */
export function estimateMessageTokens(msg: ChatCompletionMessageParam): number {
  const content =
    typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
  return Math.ceil(content.length / CHARS_PER_TOKEN) + 4;
}

/**
 * Trim `history` so it fits within `budget` tokens.
 *
 * Strategy: keep as many recent messages as possible (sliding window from the
 * end), so the agent always sees the most relevant prior context first.
 * The system prompt tokens are subtracted from the budget upfront.
 *
 * @param systemPrompt - The system prompt string (used for token estimation only)
 * @param history      - Prior conversation messages (NOT including current query)
 * @param budget       - Max tokens allowed for history (default 60 k)
 * @returns            - Trimmed history safe to pass as `conversationHistory`
 */
export function trimToTokenBudget(
  systemPrompt: string,
  history: ChatCompletionMessageParam[],
  budget = DEFAULT_HISTORY_TOKEN_BUDGET,
): ChatCompletionMessageParam[] {
  if (history.length === 0) return [];

  // Subtract system prompt tokens from the available budget
  const systemTokens = Math.ceil(systemPrompt.length / CHARS_PER_TOKEN) + 4;
  let remaining = budget - systemTokens;
  if (remaining <= 0) return [];

  // Walk history newest → oldest, keep messages that fit
  const kept: ChatCompletionMessageParam[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const tokens = estimateMessageTokens(history[i]);
    if (tokens > remaining) break;
    remaining -= tokens;
    kept.unshift(history[i]);
  }

  return kept;
}

// ── Session lifecycle ──────────────────────────────────────────────────────────

/**
 * Mark a session as closed after a conversation turn ends.
 * Closed sessions can still be re-opened by providing their sessionId.
 */
export async function closeSession(sessionId: number): Promise<void> {
  await db
    .update(schema.agentSessions)
    .set({ status: "closed" })
    .where(eq(schema.agentSessions.id, sessionId));
}

/**
 * Mark active sessions older than `ttlHours` as "expired" and delete their
 * messages to free space.  Safe to call from a periodic cleanup job.
 *
 * @returns Number of sessions expired.
 */
export async function cleanupExpiredSessions(
  ttlHours = SESSION_TTL_HOURS,
): Promise<number> {
  // Find sessions whose createdAt is older than the TTL
  const expired = await db
    .select({ id: schema.agentSessions.id })
    .from(schema.agentSessions)
    .where(
      sql`${schema.agentSessions.status} = 'active'
          AND datetime(${schema.agentSessions.createdAt}) < datetime('now', ${`-${ttlHours} hours`})`,
    );

  if (expired.length === 0) return 0;

  for (const { id } of expired) {
    // Delete messages first to satisfy the FK constraint
    await db
      .delete(schema.agentMessages)
      .where(eq(schema.agentMessages.sessionId, id));

    await db
      .update(schema.agentSessions)
      .set({ status: "expired" })
      .where(eq(schema.agentSessions.id, id));
  }

  return expired.length;
}
