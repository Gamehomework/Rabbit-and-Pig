/**
 * Multi-Agent routes: POST /api/agent/multi-stream
 * Streams multi-agent analysis progress via SSE.
 */

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { runCoordinatorStream } from "../agents/index.js";
import { buildStockContext } from "../agent/context/stockContextLoader.js";

export async function multiAgentRoutes(app: FastifyInstance) {
  // ── Multi-Agent SSE Streaming endpoint ────────────────────────
  app.post<{
    Body: { query: string; stockSymbol?: string; urls?: string[] };
  }>("/api/agent/multi-stream", {
    schema: {
      body: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1 },
          stockSymbol: { type: "string" },
          urls: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const { query, stockSymbol, urls } = request.body;

      try {
        // Create a new session for multi-agent analysis
        const [session] = await db
          .insert(schema.agentSessions)
          .values({ status: "active" })
          .returning();
        const sessionId = session.id;

        // Log the query
        await db.insert(schema.queryLogs).values({
          sessionId,
          queryText: `[multi-agent] ${query}`,
        });

        // Pre-load stock context if symbol provided
        let stockContext = "";
        if (stockSymbol) {
          try {
            stockContext = await buildStockContext(stockSymbol);
          } catch { /* best-effort */ }
        }

        // Set SSE headers (must include CORS since reply.raw bypasses Fastify hooks)
        const origin = request.headers.origin;
        const allowedOrigins = ["http://localhost:3002", "http://127.0.0.1:3002"];
        const corsOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Credentials": "true",
        });

        // Send initial session info
        reply.raw.write(`data: ${JSON.stringify({ type: "session", sessionId })}\n\n`);

        // Stream multi-agent events
        for await (const event of runCoordinatorStream(query, {
          stockSymbol,
          urls,
          stockContext,
        })) {
          reply.raw.write(`data: ${JSON.stringify({ type: event.type, ...event.data })}\n\n`);
        }

        // Send done sentinel
        reply.raw.write(`data: [DONE]\n\n`);
        reply.raw.end();

        // Update session status
        await db
          .update(schema.agentSessions)
          .set({ status: "completed" })
          .where(eq(schema.agentSessions.id, sessionId))
          .catch(() => {}); // best-effort
      } catch (err) {
        const message = err instanceof Error ? err.message : "Multi-agent stream failed";
        request.log.error(err, "Multi-agent stream error");

        if (reply.raw.headersSent) {
          reply.raw.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
          reply.raw.write(`data: [DONE]\n\n`);
          reply.raw.end();
        } else {
          return reply.status(500).send({ error: message, statusCode: 500 });
        }
      }
    },
  });
}

