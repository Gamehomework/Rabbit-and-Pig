/**
 * Analytics aggregator: time-series aggregation using SQLite datetime functions.
 */

import { db, schema } from "../db/index.js";
import { sql, count, eq, and, gte, lte, isNotNull } from "drizzle-orm";
import type {
  DateRange,
  OverviewStats,
  QueryVolume,
  ToolUsage,
  NotificationStats,
  NotesAnalytics,
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

export async function notesAnalytics(dateRange?: DateRange): Promise<NotesAnalytics> {
  const range = dateRange ?? defaultDateRange();

  // Total notes in range
  const [totalRow] = await db
    .select({ total: count() })
    .from(schema.notes)
    .where(dateFilters(schema.notes, range));

  // Notes grouped by stock symbol (exclude null stockSymbol)
  const notesByStockRows = await db
    .select({
      stockSymbol: schema.notes.stockSymbol,
      count: count(),
    })
    .from(schema.notes)
    .where(and(dateFilters(schema.notes, range), isNotNull(schema.notes.stockSymbol)))
    .groupBy(schema.notes.stockSymbol)
    .orderBy(sql`count(*) DESC`);

  const notesByStock = notesByStockRows.map((r) => ({
    stockSymbol: r.stockSymbol!,
    count: r.count,
  }));

  // Daily note creation trend
  const trendRows = await db
    .select({
      timestamp: sql<string>`strftime('%Y-%m-%d', ${schema.notes.createdAt})`,
      count: count(),
    })
    .from(schema.notes)
    .where(dateFilters(schema.notes, range))
    .groupBy(sql`strftime('%Y-%m-%d', ${schema.notes.createdAt})`)
    .orderBy(sql`strftime('%Y-%m-%d', ${schema.notes.createdAt})`);

  const notesTrend = trendRows.map((r) => ({ timestamp: r.timestamp, count: r.count }));

  // Top 10 most-noted symbols
  const topNotedStocks = notesByStock.slice(0, 10).map((r) => r.stockSymbol);

  // Stocks with notes but no query_logs entries mentioning them
  const allNotedSymbols = notesByStockRows.map((r) => r.stockSymbol!);
  const queryTexts = await db
    .select({ queryText: schema.queryLogs.queryText })
    .from(schema.queryLogs);

  const notedButNeverQueried = allNotedSymbols.filter(
    (symbol) => !queryTexts.some((q) => q.queryText.toUpperCase().includes(symbol.toUpperCase())),
  );

  return {
    totalNotes: totalRow.total,
    notesByStock,
    notesTrend,
    topNotedStocks,
    notedButNeverQueried,
  };
}

