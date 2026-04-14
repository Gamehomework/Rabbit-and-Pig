/**
 * Analytics aggregator: time-series aggregation using SQLite datetime functions.
 */

import { db, schema } from "../db/index.js";
import { sql, count, eq, and, gte, lte } from "drizzle-orm";
import type {
  DateRange,
  OverviewStats,
  QueryVolume,
  ToolUsage,
  NotificationStats,
} from "./types.js";

function defaultDateRange(): DateRange {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from, to };
}

function toIso(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function dateFilters(table: { createdAt: any } | { timestamp: any } | { sentAt: any }, range: DateRange) {
  const col = "createdAt" in table ? table.createdAt : "timestamp" in table ? table.timestamp : (table as any).sentAt;
  return and(gte(col, toIso(range.from)), lte(col, toIso(range.to)));
}

export async function overviewStats(dateRange?: DateRange): Promise<OverviewStats> {
  const range = dateRange ?? defaultDateRange();

  const [queryCount] = await db
    .select({ total: count() })
    .from(schema.queryLogs)
    .where(dateFilters(schema.queryLogs, range));

  const [toolStats] = await db
    .select({
      avgLatency: sql<number>`COALESCE(AVG(${schema.toolExecutionLogs.latencyMs}), 0)`,
      total: count(),
      successes: sql<number>`COALESCE(SUM(CASE WHEN ${schema.toolExecutionLogs.success} = 1 THEN 1 ELSE 0 END), 0)`,
    })
    .from(schema.toolExecutionLogs)
    .where(dateFilters(schema.toolExecutionLogs, range));

  const [sessionCount] = await db
    .select({ total: count() })
    .from(schema.agentSessions)
    .where(and(
      gte(schema.agentSessions.createdAt, toIso(range.from)),
      lte(schema.agentSessions.createdAt, toIso(range.to)),
      eq(schema.agentSessions.status, "active"),
    ));

  const [notifCount] = await db
    .select({ total: count() })
    .from(schema.notificationHistory)
    .where(dateFilters(schema.notificationHistory, range));

  return {
    totalQueries: queryCount.total,
    avgLatencyMs: Math.round(toolStats.avgLatency),
    successRate: toolStats.total > 0 ? Number((toolStats.successes / toolStats.total).toFixed(4)) : 0,
    activeSessions: sessionCount.total,
    totalNotifications: notifCount.total,
  };
}

const strftimeFormats: Record<string, string> = {
  hour: "%Y-%m-%d %H:00:00",
  day: "%Y-%m-%d",
  week: "%Y-W%W",
};

export async function queryVolumeByPeriod(
  period: "hour" | "day" | "week" = "day",
  dateRange?: DateRange,
): Promise<QueryVolume[]> {
  const range = dateRange ?? defaultDateRange();
  const fmt = strftimeFormats[period];

  const rows = await db
    .select({
      timestamp: sql<string>`strftime('${sql.raw(fmt)}', ${schema.queryLogs.timestamp})`,
      count: count(),
    })
    .from(schema.queryLogs)
    .where(dateFilters(schema.queryLogs, range))
    .groupBy(sql`strftime('${sql.raw(fmt)}', ${schema.queryLogs.timestamp})`)
    .orderBy(sql`strftime('${sql.raw(fmt)}', ${schema.queryLogs.timestamp})`);

  return rows.map((r) => ({ timestamp: r.timestamp, count: r.count }));
}

export async function toolUsageBreakdown(dateRange?: DateRange): Promise<ToolUsage[]> {
  const range = dateRange ?? defaultDateRange();

  const rows = await db
    .select({
      toolName: schema.toolExecutionLogs.toolName,
      count: count(),
      avgLatencyMs: sql<number>`COALESCE(AVG(${schema.toolExecutionLogs.latencyMs}), 0)`,
      successes: sql<number>`COALESCE(SUM(CASE WHEN ${schema.toolExecutionLogs.success} = 1 THEN 1 ELSE 0 END), 0)`,
      total: count(),
    })
    .from(schema.toolExecutionLogs)
    .where(dateFilters(schema.toolExecutionLogs, range))
    .groupBy(schema.toolExecutionLogs.toolName);

  return rows.map((r) => ({
    toolName: r.toolName,
    count: r.count,
    avgLatencyMs: Math.round(r.avgLatencyMs),
    successRate: r.total > 0 ? Number((r.successes / r.total).toFixed(4)) : 0,
  }));
}

export async function notificationStats(dateRange?: DateRange): Promise<NotificationStats[]> {
  const range = dateRange ?? defaultDateRange();

  const rows = await db
    .select({
      channel: schema.notificationHistory.channelType,
      sent: sql<number>`COALESCE(SUM(CASE WHEN ${schema.notificationHistory.status} = 'sent' THEN 1 ELSE 0 END), 0)`,
      failed: sql<number>`COALESCE(SUM(CASE WHEN ${schema.notificationHistory.status} = 'failed' THEN 1 ELSE 0 END), 0)`,
      rateLimited: sql<number>`COALESCE(SUM(CASE WHEN ${schema.notificationHistory.status} = 'rate_limited' THEN 1 ELSE 0 END), 0)`,
    })
    .from(schema.notificationHistory)
    .where(dateFilters(schema.notificationHistory, range))
    .groupBy(schema.notificationHistory.channelType);

  return rows.map((r) => ({
    channel: r.channel,
    sent: r.sent,
    failed: r.failed,
    rateLimited: r.rateLimited,
  }));
}

