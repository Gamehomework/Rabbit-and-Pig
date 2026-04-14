/**
 * Analytics API endpoints.
 */

import type { FastifyInstance } from "fastify";
import {
  overviewStats,
  queryVolumeByPeriod,
  toolUsageBreakdown,
  notificationStats,
  listSessions,
  getSessionTrace,
} from "../analytics/index.js";
import type { DateRange } from "../analytics/index.js";

function parseDateRange(from?: string, to?: string): DateRange | undefined {
  if (!from && !to) return undefined;
  const now = new Date();
  return {
    from: from ? new Date(from) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    to: to ? new Date(to) : now,
  };
}

export async function analyticsRoutes(app: FastifyInstance) {
  // GET /api/analytics/overview
  app.get<{ Querystring: { from?: string; to?: string } }>(
    "/api/analytics/overview",
    async (request) => {
      const range = parseDateRange(request.query.from, request.query.to);
      return overviewStats(range);
    },
  );

  // GET /api/analytics/queries
  app.get<{ Querystring: { period?: string; from?: string; to?: string } }>(
    "/api/analytics/queries",
    async (request) => {
      const period = (request.query.period ?? "day") as "hour" | "day" | "week";
      const range = parseDateRange(request.query.from, request.query.to);
      return queryVolumeByPeriod(period, range);
    },
  );

  // GET /api/analytics/tools
  app.get<{ Querystring: { from?: string; to?: string } }>(
    "/api/analytics/tools",
    async (request) => {
      const range = parseDateRange(request.query.from, request.query.to);
      return toolUsageBreakdown(range);
    },
  );

  // GET /api/analytics/sessions
  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/api/analytics/sessions",
    async (request) => {
      const limit = request.query.limit ? Number(request.query.limit) : 20;
      const offset = request.query.offset ? Number(request.query.offset) : 0;
      return listSessions(limit, offset);
    },
  );

  // GET /api/analytics/sessions/:id
  app.get<{ Params: { id: string } }>(
    "/api/analytics/sessions/:id",
    async (request, reply) => {
      const trace = await getSessionTrace(Number(request.params.id));
      if (!trace) {
        return reply.status(404).send({ error: "Session not found" });
      }
      return trace;
    },
  );

  // GET /api/analytics/notifications
  app.get<{ Querystring: { from?: string; to?: string } }>(
    "/api/analytics/notifications",
    async (request) => {
      const range = parseDateRange(request.query.from, request.query.to);
      return notificationStats(range);
    },
  );

  // GET /api/analytics/export
  app.get<{
    Querystring: { format?: string; type?: string; from?: string; to?: string };
  }>("/api/analytics/export", async (request, reply) => {
    const format = request.query.format ?? "json";
    const type = request.query.type ?? "queries";
    const range = parseDateRange(request.query.from, request.query.to);

    let data: Record<string, unknown>[];
    switch (type) {
      case "tools":
        data = (await toolUsageBreakdown(range)) as unknown as Record<string, unknown>[];
        break;
      case "sessions":
        data = (await listSessions(1000, 0, range)) as unknown as Record<string, unknown>[];
        break;
      default:
        data = (await queryVolumeByPeriod("day", range)) as unknown as Record<string, unknown>[];
    }

    if (format === "csv") {
      const csv = toCsv(data);
      return reply
        .header("Content-Type", "text/csv")
        .header("Content-Disposition", `attachment; filename="${type}-export.csv"`)
        .send(csv);
    }

    return reply
      .header("Content-Type", "application/json")
      .header("Content-Disposition", `attachment; filename="${type}-export.json"`)
      .send(JSON.stringify(data, null, 2));
  });
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const csvRows = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h];
      const str = val === null || val === undefined ? "" : String(val);
      // Quote if contains comma, quote, or newline
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvRows.push(values.join(","));
  }
  return csvRows.join("\n");
}

