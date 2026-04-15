/**
 * invoke_agent tool: the Coordinator's core tool for calling specialist agents.
 * This is a regular Tool that fits into the existing ReAct Agent tool system.
 */

import type { Tool } from "../agent/tools/types.js";
import type { InvokeAgentInput, AgentOutput, MultiAgentStreamEvent } from "./types.js";
import { AGENT_ROLES } from "./roles.js";
import { runSpecialistAgent } from "./pool.js";

/** Event callback for streaming multi-agent progress */
export type OnAgentEvent = (event: MultiAgentStreamEvent) => void;

/**
 * Create the invoke_agent tool.
 * Accepts an optional event callback for streaming progress updates.
 */
export function createInvokeAgentTool(onEvent?: OnAgentEvent): Tool<InvokeAgentInput, AgentOutput> {
  return {
    name: "invoke_agent",
    description: `Invoke a specialist agent to perform analysis. Available roles: ${Object.keys(AGENT_ROLES).join(", ")}. Each agent returns a structured analysis result. Use this to delegate tasks to specialist agents.`,
    inputSchema: {
      type: "object",
      properties: {
        role: {
          type: "string",
          enum: Object.keys(AGENT_ROLES),
          description: "Which specialist agent to invoke",
        },
        query: {
          type: "string",
          description: "Task description / question for the specialist agent",
        },
        context: {
          type: "object",
          description: "Data from previous agent results to pass as context (optional)",
        },
        urls: {
          type: "array",
          items: { type: "string" },
          description: "URLs for the news_crawler agent to fetch (optional)",
        },
      },
      required: ["role", "query"],
    },

    async execute(input: InvokeAgentInput): Promise<AgentOutput> {
      const { role, query, context, urls } = input;

      // Validate role
      if (!AGENT_ROLES[role]) {
        return {
          role: role,
          displayName: role,
          summary: `Unknown agent role: ${role}`,
          data: {},
          confidence: 0,
          sources: [],
          steps: [],
          latencyMs: 0,
          success: false,
          error: `Role "${role}" is not available. Valid roles: ${Object.keys(AGENT_ROLES).join(", ")}`,
        };
      }

      const config = AGENT_ROLES[role];

      // Emit agent_start event
      onEvent?.({
        type: "agent_start",
        data: { role: config.role, displayName: config.displayName, query },
      });

      // Run the specialist agent, forwarding step events for real-time progress
      const result = await runSpecialistAgent(role, query, context, urls, onEvent);
      // Run the specialist agent.
      // P1 fix: pass onEvent as the step callback so agent_step / agent_tool_result
      // events are forwarded to the coordinator's streaming pipeline in real time.
      const result = await runSpecialistAgent(role, query, context, urls, onEvent);

      // Emit agent_result event
      onEvent?.({
        type: "agent_result",
        data: result,
      });

      return result;
    },
  };
}

