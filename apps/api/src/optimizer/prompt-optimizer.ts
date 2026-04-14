/**
 * Prompt Optimizer: analyzes agent sessions and uses DeepSeek to suggest prompt improvements.
 */

import OpenAI from "openai";
import { db, schema } from "../db/index.js";
import { desc, eq, isNotNull, count } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { PromptSuggestion } from "./types.js";

/**
 * Analyze recent sessions and generate prompt improvement suggestions via DeepSeek.
 */
export async function analyzeAndSuggest(): Promise<PromptSuggestion[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return [
      {
        area: "configuration",
        current: "DEEPSEEK_API_KEY not set",
        suggested: "Set the DEEPSEEK_API_KEY environment variable to enable prompt analysis",
        reasoning: "The prompt optimizer requires a valid DeepSeek API key to generate suggestions.",
      },
    ];
  }

  // Fetch recent sessions (last 50)
  const sessions = await db
    .select()
    .from(schema.agentSessions)
    .orderBy(desc(schema.agentSessions.createdAt))
    .limit(50);

  if (sessions.length === 0) {
    return [
      {
        area: "data",
        current: "No sessions available",
        suggested: "Run some agent queries first to generate data for analysis",
        reasoning: "The prompt optimizer needs session data to analyze patterns.",
      },
    ];
  }

  // Fetch decision logs for these sessions
  const sessionIds = sessions.map((s) => s.id);
  const decisionLogs = await db
    .select()
    .from(schema.agentDecisionLogs)
    .orderBy(desc(schema.agentDecisionLogs.createdAt))
    .limit(200);

  // Fetch tool execution logs
  const toolLogs = await db
    .select()
    .from(schema.toolExecutionLogs)
    .orderBy(desc(schema.toolExecutionLogs.createdAt))
    .limit(200);

  // Build session traces for the prompt
  const traces = sessions.slice(0, 20).map((session) => {
    const decisions = decisionLogs.filter((d) => d.sessionId === session.id);
    const tools = toolLogs.filter((t) => t.sessionId === session.id);
    return {
      sessionId: session.id,
      status: session.status,
      steps: decisions.length,
      toolCalls: tools.map((t) => ({
        tool: t.toolName,
        success: t.success,
        latencyMs: t.latencyMs,
      })),
      decisions: decisions.map((d) => ({
        step: d.stepNumber,
        action: d.action,
        toolName: d.toolName,
      })),
    };
  });

  // Gather notes context for the optimizer
  const [notesCountRow] = await db
    .select({ total: count() })
    .from(schema.notes);

  const topNotedStocksRows = await db
    .select({
      stockSymbol: schema.notes.stockSymbol,
      noteCount: count(),
    })
    .from(schema.notes)
    .where(isNotNull(schema.notes.stockSymbol))
    .groupBy(schema.notes.stockSymbol)
    .orderBy(sql`count(*) DESC`)
    .limit(10);

  const notesContext = {
    totalNotes: notesCountRow.total,
    topNotedStocks: topNotedStocksRows.map((r) => `${r.stockSymbol} (${r.noteCount} notes)`),
  };

  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
  });

  const prompt = `You are an AI agent optimization expert. Analyze these agent session traces and suggest improvements to the system prompt.

Session traces:
${JSON.stringify(traces, null, 2)}

User research notes summary:
- Total notes: ${notesContext.totalNotes}
- Top researched stocks: ${notesContext.topNotedStocks.length > 0 ? notesContext.topNotedStocks.join(", ") : "none yet"}

For each suggestion, provide:
- area: which part of the prompt to improve (e.g., "tool selection", "response format", "error handling")
- current: what the current behavior/pattern is
- suggested: what the improved prompt text or behavior should be
- reasoning: why this change would help

Return a JSON array of suggestions. Return ONLY the JSON array, no other text.`;

  try {
    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content ?? "[]";
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [
        {
          area: "analysis",
          current: "Unable to parse AI response",
          suggested: content.slice(0, 500),
          reasoning: "The AI response could not be parsed as JSON.",
        },
      ];
    }

    const parsed = JSON.parse(jsonMatch[0]) as PromptSuggestion[];
    return parsed.map((s) => ({
      area: String(s.area ?? "general"),
      current: String(s.current ?? ""),
      suggested: String(s.suggested ?? ""),
      reasoning: String(s.reasoning ?? ""),
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [
      {
        area: "error",
        current: "Analysis failed",
        suggested: `Fix the error: ${message}`,
        reasoning: "An error occurred while calling the DeepSeek API for prompt analysis.",
      },
    ];
  }
}

