/**
 * Stock endpoints: screen, chart, news
 * These call tools directly (not through the agent).
 */

import type { FastifyInstance } from "fastify";
import YahooFinance from "yahoo-finance2";

import type { Tool } from "../agent/tools/types.js";

const yf = new YahooFinance();

/** Lazy-load a tool by name, returning undefined if not available */
async function loadTool(name: string): Promise<Tool | undefined> {
  try {
    switch (name) {
      case "screener": {
        const m = await import("../agent/tools/screener.js");
        return m.screenerTool as Tool;
      }
      case "chart": {
        const m = await import("../agent/tools/chart.js");
        return m.chartTool as Tool;
      }
      case "news": {
        const m = await import("../agent/tools/news.js");
        return m.newsTool as Tool;
      }
      case "quote": {
        const m = await import("../agent/tools/quote.js");
        return m.quoteTool as Tool;
      }
      case "backtest": {
        const m = await import("../agent/tools/backtest.js");
        return m.backtestTool as Tool;
      }
    }
  } catch {
    return undefined;
  }
}

export async function stockRoutes(app: FastifyInstance) {
  // GET /api/stocks/search?q=...
  app.get<{ Querystring: { q: string } }>("/api/stocks/search", async (request, reply) => {
    const q = (request.query.q ?? "").trim();
    if (!q) return reply.status(400).send({ error: "q is required", statusCode: 400 });

    try {
      const result = await yf.search(q, { quotesCount: 15, newsCount: 0 }, { validateResult: false }) as { quotes?: Array<Record<string, unknown>> };
      const quotes = (result.quotes ?? [])
        .filter((item: Record<string, unknown>) => {
          return item.quoteType === "EQUITY" && item.symbol;
        })
        .slice(0, 10)
        .map((item: Record<string, unknown>) => {
          return {
            symbol: item.symbol as string,
            name: (item.shortname ?? item.longname ?? item.symbol) as string,
            exchange: (item.exchDisp ?? "") as string,
            type: (item.quoteType ?? "EQUITY") as string,
          };
        });
      return quotes;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed";
      request.log.error(err, "Stock search error");
      return reply.status(500).send({ error: message, statusCode: 500 });
    }
  });

  // GET /api/stocks/screen
  app.get<{
    Querystring: {
      sector?: string;
      minMarketCap?: string;
      maxMarketCap?: string;
      minPE?: string;
      maxPE?: string;
      limit?: string;
    };
  }>("/api/stocks/screen", async (request, reply) => {
    const tool = await loadTool("screener");
    if (!tool) {
      return reply.status(503).send({
        error: "Stock screener tool is not available yet",
        statusCode: 503,
      });
    }

    try {
      const { sector, minMarketCap, maxMarketCap, minPE, maxPE, limit } = request.query;
      const input: Record<string, unknown> = {};
      if (sector) input.sector = sector;
      if (minMarketCap) input.minMarketCap = Number(minMarketCap);
      if (maxMarketCap) input.maxMarketCap = Number(maxMarketCap);
      if (minPE) input.minPE = Number(minPE);
      if (maxPE) input.maxPE = Number(maxPE);
      if (limit) input.limit = Number(limit);

      const result = await tool.execute(input);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Screen failed";
      request.log.error(err, "Stock screen error");
      return reply.status(500).send({ error: message, statusCode: 500 });
    }
  });

  // GET /api/stocks/:symbol/chart
  app.get<{
    Params: { symbol: string };
    Querystring: { range?: string };
  }>("/api/stocks/:symbol/chart", async (request, reply) => {
    const tool = await loadTool("chart");
    if (!tool) {
      return reply.status(503).send({
        error: "Chart tool is not available yet",
        statusCode: 503,
      });
    }

    try {
      const { symbol } = request.params;
      const range = request.query.range ?? "1mo";
      const result = await tool.execute({ symbol, range });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chart fetch failed";
      request.log.error(err, "Chart error");
      return reply.status(500).send({ error: message, statusCode: 500 });
    }
  });

  // GET /api/stocks/:symbol/quote
  app.get<{
    Params: { symbol: string };
  }>("/api/stocks/:symbol/quote", async (request, reply) => {
    const tool = await loadTool("quote");
    if (!tool) {
      return reply.status(503).send({
        error: "Quote tool is not available yet",
        statusCode: 503,
      });
    }

    try {
      const { symbol } = request.params;
      const result = await tool.execute({ symbol });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Quote fetch failed";
      request.log.error(err, "Quote error");
      return reply.status(500).send({ error: message, statusCode: 500 });
    }
  });

  // GET /api/stocks/:symbol/news
  app.get<{
    Params: { symbol: string };
    Querystring: { limit?: string };
  }>("/api/stocks/:symbol/news", async (request, reply) => {
    const tool = await loadTool("news");
    if (!tool) {
      return reply.status(503).send({
        error: "News tool is not available yet",
        statusCode: 503,
      });
    }

    try {
      const { symbol } = request.params;
      const limit = request.query.limit ? Number(request.query.limit) : 10;
      const result = await tool.execute({ symbol, limit });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "News fetch failed";
      request.log.error(err, "News error");
      return reply.status(500).send({ error: message, statusCode: 500 });
    }
  });

  // POST /api/stocks/:symbol/backtest
  app.post<{
    Params: { symbol: string };
    Body: {
      strategy: string;
      range?: string;
      initialCapital?: number;
      fastPeriod?: number;
      slowPeriod?: number;
      overbought?: number;
      oversold?: number;
      bbPeriod?: number;
      bbStdDev?: number;
    };
  }>("/api/stocks/:symbol/backtest", async (request, reply) => {
    const tool = await loadTool("backtest");
    if (!tool) {
      return reply.status(503).send({
        error: "Backtest tool is not available yet",
        statusCode: 503,
      });
    }

    try {
      const { symbol } = request.params;
      const body = request.body ?? {};
      const result = await tool.execute({ symbol, ...body });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Backtest failed";
      request.log.error(err, "Backtest error");
      return reply.status(500).send({ error: message, statusCode: 500 });
    }
  });
}

