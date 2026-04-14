/**
 * Performance Tracker: aggregates performance metrics from agent logs.
 */

import { db, schema } from "../db/index.js";
import { sql, eq, and, gte, count } from "drizzle-orm";
import type { PerformanceMetric } from "./types.js";

/**
 * Get performance trends aggregated by day for the last N days.
 */
export async function getPerformanceTrends(days: number): Promise<PerformanceMetric[]> {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  const sinceDateStr = sinceDate.toISOString().split("T")[0];

  // Aggregate tool execution logs by day
  const rows = await db
    .select({
      date: sql<string>`date(${schema.toolExecutionLogs.createdAt})`.as("date"),
      avgLatencyMs: sql<number>`COALESCE(AVG(${schema.toolExecutionLogs.latencyMs}), 0)`.as("avg_latency"),
      successCount: sql<number>`SUM(CASE WHEN ${schema.toolExecutionLogs.success} = 1 THEN 1 ELSE 0 END)`.as("success_count"),
      totalCount: count().as("total_count"),
    })
    .from(schema.toolExecutionLogs)
    .where(gte(sql`date(${schema.toolExecutionLogs.createdAt})`, sinceDateStr))
    .groupBy(sql`date(${schema.toolExecutionLogs.createdAt})`)
    .orderBy(sql`date(${schema.toolExecutionLogs.createdAt})`);

  // Get iteration counts per session per day from decision logs
  const iterationRows = await db
    .select({
      date: sql<string>`date(${schema.agentDecisionLogs.createdAt})`.as("date"),
      avgIterations: sql<number>`AVG(max_step)`.as("avg_iterations"),
      sessionCount: count().as("session_count"),
    })
    .from(
      db
        .select({
          sessionId: schema.agentDecisionLogs.sessionId,
          date: sql<string>`date(${schema.agentDecisionLogs.createdAt})`.as("date"),
          maxStep: sql<number>`MAX(${schema.agentDecisionLogs.stepNumber})`.as("max_step"),
        })
        .from(schema.agentDecisionLogs)
        .where(gte(sql`date(${schema.agentDecisionLogs.createdAt})`, sinceDateStr))
        .groupBy(schema.agentDecisionLogs.sessionId, sql`date(${schema.agentDecisionLogs.createdAt})`)
        .as("sub"),
    )
    .groupBy(sql`date`)
    .orderBy(sql`date`);

  // Build a lookup for iteration data
  const iterationMap = new Map<string, { avgIterations: number; sessionCount: number }>();
  for (const row of iterationRows) {
    iterationMap.set(row.date, {
      avgIterations: row.avgIterations,
      sessionCount: row.sessionCount,
    });
  }

  // Merge both result sets
  const allDates = new Set([...rows.map((r) => r.date), ...iterationRows.map((r) => r.date)]);
  const sorted = [...allDates].sort();

  return sorted.map((date) => {
    const toolRow = rows.find((r) => r.date === date);
    const iterRow = iterationMap.get(date);

    return {
      date,
      avgLatencyMs: Math.round(toolRow?.avgLatencyMs ?? 0),
      avgIterations: Math.round((iterRow?.avgIterations ?? 0) * 10) / 10,
      successRate: toolRow && toolRow.totalCount > 0
        ? Math.round((toolRow.successCount / toolRow.totalCount) * 1000) / 10
        : 0,
      queryCount: iterRow?.sessionCount ?? toolRow?.totalCount ?? 0,
    };
  });
}

/**
 * Get performance details for a single session.
 */
export async function getSessionPerformance(sessionId: number) {
  const toolLogs = await db
    .select()
    .from(schema.toolExecutionLogs)
    .where(eq(schema.toolExecutionLogs.sessionId, sessionId));

  const decisionLogs = await db
    .select()
    .from(schema.agentDecisionLogs)
    .where(eq(schema.agentDecisionLogs.sessionId, sessionId));

  const totalLatency = toolLogs.reduce((sum, log) => sum + (log.latencyMs ?? 0), 0);
  const successCount = toolLogs.filter((log) => log.success).length;
  const maxStep = decisionLogs.reduce((max, log) => Math.max(max, log.stepNumber), 0);

  return {
    latencyMs: totalLatency,
    toolCalls: toolLogs.length,
    iterations: maxStep,
    success: toolLogs.length === 0 || successCount > 0,
  };
}

