/**
 * Agent query route: POST /api/agent/query
 */

import type { FastifyInstance } from "fastify";
import { Agent, ToolRegistry, echoTool, DEFAULT_SYSTEM_PROMPT } from "../agent/index.js";
import type { AgentStreamEvent } from "../agent/index.js";
import { db, schema } from "../db/index.js";
import { buildStockContext } from "../agent/context/stockContextLoader.js";

export async function agentRoutes(app: FastifyInstance) {
  app.post<{
    Body: { query: string; sessionId?: number; stockSymbol?: string };
  }>("/api/agent/query", {
    schema: {
      body: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1 },
          sessionId: { type: "number" },
          stockSymbol: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const { query, sessionId: existingSessionId, stockSymbol } = request.body;
      const startTime = performance.now();

      try {
        // Create or reuse session
        let sessionId: number;
        if (existingSessionId) {
          const existing = await db.query.agentSessions.findFirst({
            where: (s, { eq }) => eq(s.id, existingSessionId),
          });
          if (!existing) {
            return reply.status(404).send({ error: "Session not found", statusCode: 404 });
          }
          sessionId = existing.id;
        } else {
          const [session] = await db
            .insert(schema.agentSessions)
            .values({ status: "active" })
            .returning();
          sessionId = session.id;
        }

        // Log the query
        await db.insert(schema.queryLogs).values({
          sessionId,
          queryText: query,
        });

        // Build registry with available tools
        const registry = new ToolRegistry();
        registry.register(echoTool);

        try {
          const { quoteTool } = await import("../agent/tools/quote.js");
          registry.register(quoteTool);
        } catch { /* tool not available yet */ }
        try {
          const { screenerTool } = await import("../agent/tools/screener.js");
          registry.register(screenerTool);
        } catch { /* tool not available yet */ }
        try {
          const { chartTool } = await import("../agent/tools/chart.js");
          registry.register(chartTool);
        } catch { /* tool not available yet */ }
        try {
          const { newsTool } = await import("../agent/tools/news.js");
          registry.register(newsTool);
        } catch { /* tool not available yet */ }
        try {
          const { notesTool } = await import("../agent/tools/notes.js");
          registry.register(notesTool);
        } catch { /* tool not available yet */ }
        try {
          const { sendMessageTool } = await import("../agent/tools/send-message.js");
          registry.register(sendMessageTool);
        } catch { /* tool not available yet */ }

        // Pre-load stock context if a symbol was provided (Option A: context stuffing).
        // Fetch quote + 30-day chart summary + news headlines in parallel, then inject
        // into the system prompt so the LLM has immediate data awareness.
        let stockContextBlock = "";
        if (stockSymbol) {
          try {
            stockContextBlock = await buildStockContext(stockSymbol);
          } catch { /* context loading is best-effort */ }
        }

        const systemPrompt = stockContextBlock
          ? `${stockContextBlock}\n\n${DEFAULT_SYSTEM_PROMPT}`
          : DEFAULT_SYSTEM_PROMPT;

        const agent = new Agent(registry, { systemPrompt });
        const result = await agent.run(query);

        const totalLatencyMs = Math.round(performance.now() - startTime);

        return {
          sessionId,
          answer: result.finalAnswer,
          steps: result.steps,
          totalLatencyMs,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Agent query failed";
        request.log.error(err, "Agent query error");
        return reply.status(500).send({ error: message, statusCode: 500 });
      }
    },
  });

  // ── SSE Streaming endpoint ────────────────────────────────────
  app.post<{
    Body: { query: string; sessionId?: number; stockSymbol?: string };
  }>("/api/agent/stream", {
    schema: {
      body: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1 },
          sessionId: { type: "number" },
          stockSymbol: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const { query, sessionId: existingSessionId, stockSymbol } = request.body;

      try {
        // Create or reuse session
        let sessionId: number;
        if (existingSessionId) {
          const existing = await db.query.agentSessions.findFirst({
            where: (s, { eq }) => eq(s.id, existingSessionId),
          });
          if (!existing) {
            return reply.status(404).send({ error: "Session not found", statusCode: 404 });
          }
          sessionId = existing.id;
        } else {
          const [session] = await db
            .insert(schema.agentSessions)
            .values({ status: "active" })
            .returning();
          sessionId = session.id;
        }

        // Log the query
        await db.insert(schema.queryLogs).values({
          sessionId,
          queryText: query,
        });

        // Build registry with available tools
        const registry = new ToolRegistry();
        registry.register(echoTool);

        try {
          const { quoteTool } = await import("../agent/tools/quote.js");
          registry.register(quoteTool);
        } catch { /* tool not available yet */ }
        try {
          const { screenerTool } = await import("../agent/tools/screener.js");
          registry.register(screenerTool);
        } catch { /* tool not available yet */ }
        try {
          const { chartTool } = await import("../agent/tools/chart.js");
          registry.register(chartTool);
        } catch { /* tool not available yet */ }
        try {
          const { newsTool } = await import("../agent/tools/news.js");
          registry.register(newsTool);
        } catch { /* tool not available yet */ }
        try {
          const { notesTool } = await import("../agent/tools/notes.js");
          registry.register(notesTool);
        } catch { /* tool not available yet */ }
        try {
          const { sendMessageTool } = await import("../agent/tools/send-message.js");
          registry.register(sendMessageTool);
        } catch { /* tool not available yet */ }

        // Pre-load stock context
        let stockContextBlock = "";
        if (stockSymbol) {
          try {
            stockContextBlock = await buildStockContext(stockSymbol);
          } catch { /* context loading is best-effort */ }
        }

        const systemPrompt = stockContextBlock
          ? `${stockContextBlock}\n\n${DEFAULT_SYSTEM_PROMPT}`
          : DEFAULT_SYSTEM_PROMPT;

        const agent = new Agent(registry, { systemPrompt });

        // Set SSE headers
        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        });

        // Helper to write a flat SSE data-only event that the frontend can parse.
        // The frontend parser only reads `data:` lines and expects a JSON object
        // with a `type` field plus the event-specific fields at the top level.
        const sendSSE = (payload: Record<string, unknown>) => {
          reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
        };

        // Send initial session info
        sendSSE({ type: "session", sessionId });

        // Stream agent events, flattening { type, data } into { type, ...data }
        for await (const event of agent.runStream(query)) {
          if (event.type === "step") {
            // Map backend step → frontend AgentStreamEvent "step"
            sendSSE({
              type: "step",
              iteration: event.data.iteration,
              thought: event.data.thought,
              toolName: event.data.toolName ?? null,
              toolInput: event.data.toolInput ?? null,
            });
          } else if (event.type === "tool_result") {
            // Map backend tool_result → frontend AgentStreamEvent "step" with toolResult
            sendSSE({
              type: "step",
              iteration: event.data.iteration,
              toolName: event.data.toolName,
              toolResult: event.data.result,
            });
          } else if (event.type === "answer") {
            sendSSE({
              type: "answer",
              answer: event.data.answer,
            });
          } else if (event.type === "error") {
            sendSSE({
              type: "error",
              error: event.data.message,
            });
          }
        }

        // Send done sentinel so frontend onDone fires
        reply.raw.write(`data: [DONE]\n\n`);
        reply.raw.end();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Agent stream failed";
        request.log.error(err, "Agent stream error");
        // If headers already sent, try to send error event then close
        if (reply.raw.headersSent) {
          reply.raw.write(`data: ${JSON.stringify({ type: "error", error: message })}\n\n`);
          reply.raw.write(`data: [DONE]\n\n`);
          reply.raw.end();
        } else {
          return reply.status(500).send({ error: message, statusCode: 500 });
        }
      }
    },
  });
}

