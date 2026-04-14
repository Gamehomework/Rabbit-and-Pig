/**
 * Coordinator: a ReAct agent whose primary tool is invoke_agent.
 * It dynamically decides which specialist agents to call and in what order.
 */

import { Agent } from "../agent/core.js";
import type { AgentRunResult, AgentStreamEvent } from "../agent/core.js";
import { ToolRegistry } from "../agent/tools/registry.js";
import { createInvokeAgentTool, type OnAgentEvent } from "./invoke-agent-tool.js";
import { registerSharedTool, getSharedTool } from "./pool.js";
import { COORDINATOR_SYSTEM_PROMPT } from "./roles.js";
import type { MultiAgentStreamEvent } from "./types.js";

// Import existing tools to register them in the shared pool
import { quoteTool } from "../agent/tools/quote.js";
import { newsTool } from "../agent/tools/news.js";
import { chartTool } from "../agent/tools/chart.js";
import { screenerTool } from "../agent/tools/screener.js";

// Import multi-agent specific tools
import { crawlUrlTool } from "./tools/crawl-url.js";
import { getFinancialsTool } from "./tools/get-financials.js";
import { calcIndicatorsTool } from "./tools/calc-indicators.js";
import { calcRiskTool } from "./tools/calc-risk.js";

/** Initialize shared tools that specialist agents can use */
function initSharedTools(): void {
  // Register existing tools so specialists can access them by name
  registerSharedTool(quoteTool);
  registerSharedTool(newsTool);
  registerSharedTool(chartTool);
  registerSharedTool(screenerTool);

  // Multi-agent specific tools
  registerSharedTool(crawlUrlTool);
  registerSharedTool(getFinancialsTool);
  registerSharedTool(calcIndicatorsTool);
  registerSharedTool(calcRiskTool);
}

export interface CoordinatorOptions {
  /** Optional stock symbol for context */
  stockSymbol?: string;
  /** Optional URLs for the news crawler */
  urls?: string[];
  /** Optional stock context block to prepend to system prompt */
  stockContext?: string;
}

/**
 * Run the Coordinator as a regular (non-streaming) agent.
 * Returns the full result with all agent outputs embedded.
 */
export async function runCoordinator(
  query: string,
  options: CoordinatorOptions = {},
): Promise<AgentRunResult> {
  initSharedTools();

  // Build coordinator registry — its main tool is invoke_agent
  const registry = new ToolRegistry();
  registry.register(createInvokeAgentTool());

  // Give coordinator direct access to quick-lookup tools too
  if (getSharedTool("get_quote")) registry.register(quoteTool);
  if (getSharedTool("get_news")) registry.register(newsTool);

  // Build system prompt
  let systemPrompt = COORDINATOR_SYSTEM_PROMPT;
  if (options.stockContext) {
    systemPrompt = `${options.stockContext}\n\n${systemPrompt}`;
  }

  // Inject URLs into the query if provided
  let enrichedQuery = query;
  if (options.urls && options.urls.length > 0) {
    enrichedQuery += `\n\nUser-provided URLs to analyze:\n${options.urls.map(u => `- ${u}`).join("\n")}`;
  }

  const agent = new Agent(registry, {
    systemPrompt,
    maxIterations: 15,
    toolTimeoutMs: 120_000, // 2 min timeout for invoke_agent calls
  });

  return agent.run(enrichedQuery);
}

/**
 * Run the Coordinator with SSE streaming.
 * Yields MultiAgentStreamEvents for real-time UI updates.
 */
export async function* runCoordinatorStream(
  query: string,
  options: CoordinatorOptions = {},
): AsyncGenerator<MultiAgentStreamEvent> {
  initSharedTools();

  // Collect agent events from invoke_agent calls
  const pendingEvents: MultiAgentStreamEvent[] = [];
  const onAgentEvent: OnAgentEvent = (event) => {
    pendingEvents.push(event);
  };

  // Build coordinator registry
  const registry = new ToolRegistry();
  registry.register(createInvokeAgentTool(onAgentEvent));
  if (getSharedTool("get_quote")) registry.register(quoteTool);
  if (getSharedTool("get_news")) registry.register(newsTool);

  let systemPrompt = COORDINATOR_SYSTEM_PROMPT;
  if (options.stockContext) {
    systemPrompt = `${options.stockContext}\n\n${systemPrompt}`;
  }

  let enrichedQuery = query;
  if (options.urls && options.urls.length > 0) {
    enrichedQuery += `\n\nUser-provided URLs to analyze:\n${options.urls.map(u => `- ${u}`).join("\n")}`;
  }

  const agent = new Agent(registry, {
    systemPrompt,
    maxIterations: 15,
    toolTimeoutMs: 120_000,
  });

  const startTime = performance.now();

  try {
    for await (const event of agent.runStream(enrichedQuery)) {
      // Flush any pending agent events first
      while (pendingEvents.length > 0) {
        yield pendingEvents.shift()!;
      }

      // Map core agent events to multi-agent events
      if (event.type === "step") {
        if (event.data.toolName === "invoke_agent") {
          // Coordinator is calling a specialist — the invoke_agent tool emits its own events
          yield {
            type: "coordinator_thought",
            data: { iteration: event.data.iteration, thought: event.data.thought ?? "" },
          };
        } else if (event.data.thought) {
          yield {
            type: "coordinator_thought",
            data: { iteration: event.data.iteration, thought: event.data.thought },
          };
        }
      } else if (event.type === "answer") {
        // Flush remaining agent events
        while (pendingEvents.length > 0) {
          yield pendingEvents.shift()!;
        }

        yield {
          type: "final_report",
          data: {
            summary: event.data.answer ?? "Analysis complete.",
            agentOutputs: [], // Outputs already emitted as agent_result events
            totalLatencyMs: Math.round(performance.now() - startTime),
          },
        };
      } else if (event.type === "error") {
        yield { type: "error", data: { message: event.data.message } };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", data: { message } };
  }
}

