/**
 * Agent query route: POST /api/agent/query
 */

import type { FastifyInstance } from "fastify";
import { Agent, ToolRegistry, echoTool, DEFAULT_SYSTEM_PROMPT } from "../agent/index.js";
import type { AgentStreamEvent } from "../agent/index.js";
import { db, schema } from "../db/index.js";
import { buildStockContext } from "../agent/context/stockContextLoader.js";
import { createInvokeAgentTool } from "../agents/invoke-agent-tool.js";
import { registerSharedTool } from "../agents/pool.js";
import type { MultiAgentStreamEvent } from "../agents/types.js";

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
        try {
          const { pageControlTools } = await import("../agent/tools/page-control.js");
          for (const tool of pageControlTools) {
            registry.register(tool);
          }
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
          registerSharedTool(quoteTool);
        } catch { /* tool not available yet */ }
        try {
          const { screenerTool } = await import("../agent/tools/screener.js");
          registry.register(screenerTool);
          registerSharedTool(screenerTool);
        } catch { /* tool not available yet */ }
        try {
          const { chartTool } = await import("../agent/tools/chart.js");
          registry.register(chartTool);
          registerSharedTool(chartTool);
        } catch { /* tool not available yet */ }
        try {
          const { newsTool } = await import("../agent/tools/news.js");
          registry.register(newsTool);
          registerSharedTool(newsTool);
        } catch { /* tool not available yet */ }
        try {
          const { notesTool } = await import("../agent/tools/notes.js");
          registry.register(notesTool);
        } catch { /* tool not available yet */ }
        try {
          const { sendMessageTool } = await import("../agent/tools/send-message.js");
          registry.register(sendMessageTool);
        } catch { /* tool not available yet */ }
        try {
          const { pageControlTools } = await import("../agent/tools/page-control.js");
          for (const tool of pageControlTools) {
            registry.register(tool);
          }
        } catch { /* tool not available yet */ }

        // Register multi-agent specific tools in the shared pool for specialist agents
        try {
          const { crawlUrlTool } = await import("../agents/tools/crawl-url.js");
          registerSharedTool(crawlUrlTool);
        } catch { /* tool not available yet */ }
        try {
          const { getFinancialsTool } = await import("../agents/tools/get-financials.js");
          registerSharedTool(getFinancialsTool);
        } catch { /* tool not available yet */ }
        try {
          const { calcIndicatorsTool } = await import("../agents/tools/calc-indicators.js");
          registerSharedTool(calcIndicatorsTool);
        } catch { /* tool not available yet */ }
        try {
          const { calcRiskTool } = await import("../agents/tools/calc-risk.js");
          registerSharedTool(calcRiskTool);
        } catch { /* tool not available yet */ }

        // Register invoke_agent tool with event callback for streaming agent events
        const pendingAgentEvents: MultiAgentStreamEvent[] = [];
        const onAgentEvent = (event: MultiAgentStreamEvent) => {
          pendingAgentEvents.push(event);
        };
        registry.register(createInvokeAgentTool(onAgentEvent));

        // Pre-load stock context
        let stockContextBlock = "";
        if (stockSymbol) {
          try {
            stockContextBlock = await buildStockContext(stockSymbol);
          } catch { /* context loading is best-effort */ }
        }

        const UPGRADED_SYSTEM_PROMPT = `${DEFAULT_SYSTEM_PROMPT}

## Autonomous Agent Orchestration
You also have access to an **invoke_agent** tool that delegates work to specialist agents for deeper analysis.

### When to use invoke_agent
- **Simple questions** (price, quote, news): Use get_quote, chart_data, get_news directly. Do NOT invoke_agent.
- **Complex / autonomous analysis** (comprehensive research, multi-factor analysis, risk assessment): Use invoke_agent to delegate to specialist agents.

### Available specialist agents (via invoke_agent)
- **fundamental**: Deep financial analysis — earnings, revenue, balance sheet, valuation ratios
- **quant**: Technical/quantitative analysis — indicators, patterns, statistical metrics
- **news_crawler**: In-depth news research — crawls URLs, aggregates sentiment from multiple sources
- **strategist**: Investment strategy synthesis — combines fundamental + quant + news into actionable advice
- **decision_maker**: Final investment recommendation with confidence scoring
- **visualizer**: Generates structured data for charts and visualizations

### Orchestration Strategy
For a comprehensive autonomous analysis:
1. Start with get_quote for current data
2. invoke_agent(role="fundamental") for financial deep-dive
3. invoke_agent(role="quant") for technical analysis
4. invoke_agent(role="news_crawler") for news sentiment
5. invoke_agent(role="strategist", context=previous results) for synthesis
6. invoke_agent(role="decision_maker", context=all results) for final recommendation

You can run agents in any order and pass context between them. Always use invoke_agent for autonomous/comprehensive analysis requests.`;

        const systemPrompt = stockContextBlock
          ? `${stockContextBlock}\n\n${UPGRADED_SYSTEM_PROMPT}`
          : UPGRADED_SYSTEM_PROMPT;

        const agent = new Agent(registry, {
          systemPrompt,
          maxIterations: 15,
          toolTimeoutMs: 120_000, // 2 min timeout for invoke_agent calls
        });

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

        // Helper to write a flat SSE data-only event that the frontend can parse.
        // The frontend parser only reads `data:` lines and expects a JSON object
        // with a `type` field plus the event-specific fields at the top level.
        const sendSSE = (payload: Record<string, unknown>) => {
          reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
        };

        // Send initial session info
        sendSSE({ type: "session", sessionId });

        // Stream agent events, flushing pending agent events before each core event
        for await (const event of agent.runStream(query)) {
          // Flush any pending agent events (agent_start / agent_result) to SSE
          while (pendingAgentEvents.length > 0) {
            const agentEvent = pendingAgentEvents.shift()!;
            if (agentEvent.type === "agent_start") {
              sendSSE({
                type: "agent_start",
                role: agentEvent.data.role,
                displayName: agentEvent.data.displayName,
              });
            } else if (agentEvent.type === "agent_result") {
              const result = agentEvent.data;
              sendSSE({
                type: "agent_result",
                role: result.role,
                displayName: result.displayName,
                agentSummary: result.summary,
                agentSuccess: result.success,
                agentConfidence: result.confidence,
                agentLatencyMs: result.latencyMs,
              });
            }
          }

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
            // Flush remaining agent events before sending final answer
            while (pendingAgentEvents.length > 0) {
              const agentEvent = pendingAgentEvents.shift()!;
              if (agentEvent.type === "agent_start") {
                sendSSE({
                  type: "agent_start",
                  role: agentEvent.data.role,
                  displayName: agentEvent.data.displayName,
                });
              } else if (agentEvent.type === "agent_result") {
                const result = agentEvent.data;
                sendSSE({
                  type: "agent_result",
                  role: result.role,
                  displayName: result.displayName,
                  agentSummary: result.summary,
                  agentSuccess: result.success,
                  agentConfidence: result.confidence,
                  agentLatencyMs: result.latencyMs,
                });
              }
            }
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

