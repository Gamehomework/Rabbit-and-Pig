/**
 * Session analysis: listing and detailed session traces.
 */

import { db, schema } from "../db/index.js";
import { sql, eq, desc, count, gte, lte, and } from "drizzle-orm";
import type { DateRange, SessionSummary, SessionTrace } from "./types.js";

function toIso(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export async function listSessions(
  limit = 20,
  offset = 0,
  dateRange?: DateRange,
): Promise<SessionSummary[]> {
  // Build session list with aggregated stats via subqueries
  const dateConditions = dateRange
    ? and(
        gte(schema.agentSessions.createdAt, toIso(dateRange.from)),
        lte(schema.agentSessions.createdAt, toIso(dateRange.to)),
      )
    : undefined;

  const sessions = await db
    .select({
      id: schema.agentSessions.id,
      createdAt: schema.agentSessions.createdAt,
      status: schema.agentSessions.status,
    })
    .from(schema.agentSessions)
    .where(dateConditions)
    .orderBy(desc(schema.agentSessions.createdAt))
    .limit(limit)
    .offset(offset);

  const results: SessionSummary[] = [];

  for (const session of sessions) {
    const [qc] = await db
      .select({ total: count() })
      .from(schema.queryLogs)
      .where(eq(schema.queryLogs.sessionId, session.id));

    const [tc] = await db
      .select({
        total: count(),
        avgLatency: sql<number>`COALESCE(AVG(${schema.toolExecutionLogs.latencyMs}), 0)`,
      })
      .from(schema.toolExecutionLogs)
      .where(eq(schema.toolExecutionLogs.sessionId, session.id));

    results.push({
      id: session.id,
      createdAt: session.createdAt,
      status: session.status,
      queryCount: qc.total,
      toolCalls: tc.total,
      avgLatency: Math.round(tc.avgLatency),
    });
  }

  return results;
}

export async function getSessionTrace(sessionId: number): Promise<SessionTrace | null> {
  const [session] = await db
    .select({
      id: schema.agentSessions.id,
      createdAt: schema.agentSessions.createdAt,
      status: schema.agentSessions.status,
    })
    .from(schema.agentSessions)
    .where(eq(schema.agentSessions.id, sessionId));

  if (!session) return null;

  const queries = await db
    .select({
      id: schema.queryLogs.id,
      queryText: schema.queryLogs.queryText,
      timestamp: schema.queryLogs.timestamp,
    })
    .from(schema.queryLogs)
    .where(eq(schema.queryLogs.sessionId, sessionId))
    .orderBy(schema.queryLogs.timestamp);

  const decisions = await db
    .select({
      id: schema.agentDecisionLogs.id,
      stepNumber: schema.agentDecisionLogs.stepNumber,
      thought: schema.agentDecisionLogs.thought,
      action: schema.agentDecisionLogs.action,
      toolName: schema.agentDecisionLogs.toolName,
      result: schema.agentDecisionLogs.result,
      createdAt: schema.agentDecisionLogs.createdAt,
    })
    .from(schema.agentDecisionLogs)
    .where(eq(schema.agentDecisionLogs.sessionId, sessionId))
    .orderBy(schema.agentDecisionLogs.stepNumber);

  const toolExecutions = await db
    .select({
      id: schema.toolExecutionLogs.id,
      toolName: schema.toolExecutionLogs.toolName,
      input: schema.toolExecutionLogs.input,
      output: schema.toolExecutionLogs.output,
      latencyMs: schema.toolExecutionLogs.latencyMs,
      success: schema.toolExecutionLogs.success,
      createdAt: schema.toolExecutionLogs.createdAt,
    })
    .from(schema.toolExecutionLogs)
    .where(eq(schema.toolExecutionLogs.sessionId, sessionId))
    .orderBy(schema.toolExecutionLogs.createdAt);

  return { session, queries, decisions, toolExecutions };
}

