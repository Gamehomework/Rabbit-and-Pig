/**
 * User Personalizer: manages user preferences and generates personalization context.
 */

import { db, schema } from "../db/index.js";
import { eq, isNotNull, desc } from "drizzle-orm";
import type { UserPreferences } from "./types.js";

/**
 * Save (upsert) a single preference.
 */
export async function savePreference(key: string, value: unknown): Promise<void> {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  const existing = await db
    .select()
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.key, key))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.userPreferences)
      .set({ value: serialized, updatedAt: new Date().toISOString() })
      .where(eq(schema.userPreferences.key, key));
  } else {
    await db.insert(schema.userPreferences).values({
      key,
      value: serialized,
    });
  }
}

/**
 * Get a single preference by key.
 */
export async function getPreference(key: string): Promise<unknown | null> {
  const rows = await db
    .select()
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.key, key))
    .limit(1);

  if (rows.length === 0) return null;

  try {
    return JSON.parse(rows[0].value);
  } catch {
    return rows[0].value;
  }
}

/**
 * Get all preferences as an object.
 */
export async function getAllPreferences(): Promise<Record<string, unknown>> {
  const rows = await db.select().from(schema.userPreferences);
  const result: Record<string, unknown> = {};

  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      result[row.key] = row.value;
    }
  }

  return result;
}

/**
 * Track a query pattern: extract mentioned stock symbols and query intent,
 * and update preferences accordingly.
 */
export async function trackQueryPattern(query: string): Promise<void> {
  // Extract stock symbols (1-5 uppercase letters)
  const symbolMatches = query.match(/\b[A-Z]{1,5}\b/g) ?? [];
  // Filter common words that aren't stock symbols
  const commonWords = new Set(["I", "A", "THE", "AND", "OR", "FOR", "TO", "IN", "IS", "IT", "OF", "ON", "AT", "BY", "AN"]);
  const symbols = symbolMatches.filter((s) => !commonWords.has(s));

  if (symbols.length > 0) {
    const existing = (await getPreference("watchedStocks")) as string[] | null;
    const current = Array.isArray(existing) ? existing : [];
    const updated = [...new Set([...current, ...symbols])].slice(0, 50); // Cap at 50
    await savePreference("watchedStocks", updated);
  }

  // Detect query intent
  const intents: string[] = [];
  const lower = query.toLowerCase();
  if (lower.includes("price") || lower.includes("quote")) intents.push("price_check");
  if (lower.includes("news") || lower.includes("headline")) intents.push("news");
  if (lower.includes("chart") || lower.includes("trend") || lower.includes("history")) intents.push("technical_analysis");
  if (lower.includes("compare") || lower.includes("vs")) intents.push("comparison");
  if (lower.includes("screen") || lower.includes("find") || lower.includes("filter")) intents.push("screening");

  if (intents.length > 0) {
    const existing = (await getPreference("commonQueryTypes")) as string[] | null;
    const current = Array.isArray(existing) ? existing : [];
    const updated = [...new Set([...current, ...intents])].slice(0, 20);
    await savePreference("commonQueryTypes", updated);
  }
}

/**
 * Extract watched stocks from the notes table.
 * Returns distinct stock symbols from notes, ordered by frequency.
 */
export async function extractWatchedFromNotes(): Promise<string[]> {
  const rows = await db
    .select({ stockSymbol: schema.notes.stockSymbol })
    .from(schema.notes)
    .where(isNotNull(schema.notes.stockSymbol))
    .groupBy(schema.notes.stockSymbol)
    .orderBy(desc(schema.notes.stockSymbol));

  return rows.map((r) => r.stockSymbol!);
}

/**
 * Build a personalization context string to append to agent system prompt.
 */
export async function getPersonalizationContext(): Promise<string> {
  const prefs = await getAllPreferences();
  const parts: string[] = [];

  // Merge notes-based stocks (higher priority) with query-pattern stocks
  const notesStocks = await extractWatchedFromNotes();
  const queryStocks = Array.isArray(prefs.watchedStocks) ? (prefs.watchedStocks as string[]) : [];
  const mergedStocks = [...new Set([...notesStocks, ...queryStocks])].slice(0, 50);

  if (mergedStocks.length > 0) {
    parts.push(`User frequently asks about: ${mergedStocks.join(", ")}.`);
  }

  const tools = prefs.preferredTools;
  if (Array.isArray(tools) && tools.length > 0) {
    parts.push(`User prefers these tools: ${(tools as string[]).join(", ")}.`);
  }

  const queryTypes = prefs.commonQueryTypes;
  if (Array.isArray(queryTypes) && queryTypes.length > 0) {
    parts.push(`Common query types: ${(queryTypes as string[]).join(", ")}.`);
  }

  // Recent notes context
  const recentNotes = await db
    .select({
      title: schema.notes.title,
      stockSymbol: schema.notes.stockSymbol,
    })
    .from(schema.notes)
    .orderBy(desc(schema.notes.createdAt))
    .limit(5);

  if (recentNotes.length > 0) {
    const noteDescriptions = recentNotes.map((n) => {
      const symbol = n.stockSymbol ? `[${n.stockSymbol}] ` : "";
      return `${symbol}${n.title}`;
    });
    parts.push(`User's recent research notes: ${noteDescriptions.join(", ")}.`);
  }

  if (parts.length === 0) {
    return "";
  }

  return `\n\n## User Preferences\n${parts.join("\n")}`;
}

