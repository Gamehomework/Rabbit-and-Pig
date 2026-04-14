/**
 * Logs endpoints: query logs, decision logs, stats
 */

import type { FastifyInstance } from "fastify";
import { db, schema } from "../db/index.js";
import { eq, desc, sql, count } from "drizzle-orm";

export async function logsRoutes(app: FastifyInstance) {
  // GET /api/logs — agent activity (decision logs + tool execution logs)
  app.get<{
    Querystring: { sessionId?: string; limit?: string; offset?: string };
  }>("/api/logs", async (request) => {
    const sessionId = request.query.sessionId
      ? Number(request.query.sessionId)
      : undefined;
    const limit = request.query.limit ? Number(request.query.limit) : 50;
    const offset = request.query.offset ? Number(request.query.offset) : 0;

    // Fetch decision logs
    const decisionLogs = sessionId
      ? await db
          .select()
          .from(schema.agentDecisionLogs)
          .where(eq(schema.agentDecisionLogs.sessionId, sessionId))
          .orderBy(desc(schema.agentDecisionLogs.createdAt))
          .limit(limit)
          .offset(offset)
      : await db
          .select()
          .from(schema.agentDecisionLogs)
          .orderBy(desc(schema.agentDecisionLogs.createdAt))
          .limit(limit)
          .offset(offset);

    // Fetch tool execution logs
    const toolLogs = sessionId
      ? await db
          .select()
          .from(schema.toolExecutionLogs)
          .where(eq(schema.toolExecutionLogs.sessionId, sessionId))
          .orderBy(desc(schema.toolExecutionLogs.createdAt))
          .limit(limit)
          .offset(offset)
      : await db
          .select()
          .from(schema.toolExecutionLogs)
          .orderBy(desc(schema.toolExecutionLogs.createdAt))
          .limit(limit)
          .offset(offset);

    return { decisionLogs, toolLogs };
  });

  // GET /api/logs/stats — usage metrics
  app.get("/api/logs/stats", async () => {
    // Total queries
    const [queryCountResult] = await db
      .select({ total: count() })
      .from(schema.queryLogs);

    // Average latency from tool executions
    const [avgLatencyResult] = await db
      .select({
        avgLatency: sql<number>`COALESCE(AVG(${schema.toolExecutionLogs.latencyMs}), 0)`,
      })
      .from(schema.toolExecutionLogs);

    // Tool frequency
    const toolFrequencyRows = await db
      .select({
        toolName: schema.toolExecutionLogs.toolName,
        uses: count(),
      })
      .from(schema.toolExecutionLogs)
      .groupBy(schema.toolExecutionLogs.toolName);

    const toolFrequency: Record<string, number> = {};
    for (const row of toolFrequencyRows) {
      toolFrequency[row.toolName] = row.uses;
    }

    return {
      totalQueries: queryCountResult.total,
      avgLatencyMs: Math.round(avgLatencyResult.avgLatency),
      toolFrequency,
    };
  });
}

