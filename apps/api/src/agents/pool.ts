/**
 * AgentPool: manages specialist agent configurations and executes them
 * by wrapping the existing ReAct Agent class.
 */

import { Agent } from "../agent/core.js";
import type { AgentStep } from "../agent/core.js";
import { ToolRegistry } from "../agent/tools/registry.js";
import type { Tool } from "../agent/tools/types.js";
import type { AgentRoleConfig, AgentOutput, AgentRole, MultiAgentStreamEvent } from "./types.js";
import { AGENT_ROLES } from "./roles.js";

/** Registry of all available tools across agents */
let sharedToolMap: Map<string, Tool> = new Map();

/** Register a tool in the shared tool map so agents can access it by name */
export function registerSharedTool(tool: Tool): void {
  sharedToolMap.set(tool.name, tool);
}

/** Get a tool by name from the shared map */
export function getSharedTool(name: string): Tool | undefined {
  return sharedToolMap.get(name);
}

/** Clear all shared tools (useful for testing) */
export function clearSharedTools(): void {
  sharedToolMap = new Map();
}

// ── Shared helper ────────────────────────────────────────────────────────────

/**
 * Parse the LLM's final answer text into structured AgentOutput fields.
 * Tries to extract a JSON block; falls back to raw text.
 */
function parseFinalAnswer(finalAnswer: string | null): {
  data: Record<string, unknown>;
  summary: string;
  confidence: number;
  sources: string[];
} {
  let data: Record<string, unknown> = {};
  let summary = finalAnswer ?? "No response from agent.";
  let confidence = 0.5;
  let sources: string[] = [];

  if (finalAnswer) {
    try {
      const jsonMatch =
        finalAnswer.match(/```json\s*([\s\S]*?)```/) ??
        finalAnswer.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] ?? jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        data = parsed;
        summary = parsed.summary ?? summary;
        confidence = parsed.confidence ?? confidence;
        sources = parsed.sources ?? sources;
      }
    } catch {
      // If JSON parsing fails, use the raw text as summary
      data = { rawText: finalAnswer };
    }
  }

  return { data, summary, confidence, sources };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Execute a specialist agent by role.
 * Creates a ReAct Agent with the role-specific system prompt and tools,
 * runs it, and returns a structured AgentOutput.
 *
 * @param onStepEvent - Optional callback fired for each tool call / result so the
 *   coordinator can stream `agent_step` and `agent_tool_result` events in real-time.
 *
 * @param onStepEvent  P1 fix: optional callback to receive real-time step/tool events
 *                     emitted by the specialist agent during its ReAct loop.
 * @param toolTimeoutMs P1 fix: per-tool timeout forwarded to the specialist Agent
 *                      (default: 60 s, coordinator uses 120 s for invoke_agent).
 */
export async function runSpecialistAgent(
  role: AgentRole,
  query: string,
  context?: Record<string, unknown>,
  urls?: string[],
  onStepEvent?: (event: MultiAgentStreamEvent) => void,
  toolTimeoutMs?: number,
): Promise<AgentOutput> {
  const config = AGENT_ROLES[role];
  if (!config) {
    return {
      role,
      displayName: role,
      summary: `Unknown agent role: ${role}`,
      data: {},
      confidence: 0,
      sources: [],
      steps: [],
      latencyMs: 0,
      success: false,
      error: `Agent role "${role}" is not configured.`,
    };
  }

  // P0 fix: agents with no tools are pure synthesis agents (strategist, decision_maker).
  // If they receive no context they have nothing to synthesise — fail fast with a clear error
  // instead of silently hallucinating a result.
  if (config.toolNames.length === 0 && (!context || Object.keys(context).length === 0)) {
    return {
      role,
      displayName: config.displayName,
      summary: `${config.displayName} requires context from upstream analysis agents but none was provided.`,
      data: {},
      confidence: 0,
      sources: [],
      steps: [],
      latencyMs: 0,
      success: false,
      error: `Agent "${role}" has no tools and received no context. ` +
        `Invoke analysis agents (news_crawler, fundamental, quant) first and pass their results as context.`,
    };
  }

  const start = performance.now();

  try {
    // Build a ToolRegistry with only this agent's tools
    const registry = new ToolRegistry();
    for (const toolName of config.toolNames) {
      const tool = sharedToolMap.get(toolName);
      if (tool) {
        registry.register(tool);
      }
    }

    // Build system prompt with context injection
    let systemPrompt = config.systemPrompt;
    if (context && Object.keys(context).length > 0) {
      systemPrompt += `\n\n## Context from previous analysis\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;
    }
    if (urls && urls.length > 0) {
      systemPrompt += `\n\n## URLs to crawl\n${urls.map(u => `- ${u}`).join("\n")}`;
    }

    // Create and run a ReAct agent with role-specific config
    // P1 fix: forward toolTimeoutMs so slow tools (e.g. crawl_url) don't hit the 30 s default
    const agent = new Agent(registry, {
      systemPrompt,
      maxIterations: config.maxIterations,
      toolTimeoutMs: toolTimeoutMs ?? 60_000,
    });

    // ── Streaming path (P1 fix) ─────────────────────────────────────────────
    // When a step callback is provided, run the agent in streaming mode so the
    // coordinator can forward agent_step / agent_tool_result events to the client
    // in real time instead of only receiving a result after the agent finishes.
    if (onStepEvent) {
      const steps: AgentStep[] = [];
      let finalAnswer: string | null = null;
      let success = false;
      // Track the thought associated with each iteration so we can attach it
      // to the AgentStep when the tool_result event arrives.
      const thoughtByIteration = new Map<number, string | null>();

      for await (const event of agent.runStream(query)) {
        if (event.type === "step" && event.data.action === "tool_call") {
          thoughtByIteration.set(event.data.iteration, event.data.thought ?? null);
          onStepEvent({
            type: "agent_step",
            data: {
              role,
              iteration: event.data.iteration,
              thought: event.data.thought ?? null,
              toolName: event.data.toolName,
              toolInput: event.data.toolInput,
            },
          });
        } else if (event.type === "tool_result") {
          onStepEvent({
            type: "agent_tool_result",
            data: {
              role,
              iteration: event.data.iteration,
              toolName: event.data.toolName,
              success: event.data.result.success,
              output: event.data.result.output,
            },
          });
          steps.push({
            iteration: event.data.iteration,
            thought: thoughtByIteration.get(event.data.iteration) ?? null,
            toolCall: { name: event.data.toolName, input: event.data.result.input },
            toolResult: event.data.result,
          });
        } else if (event.type === "answer") {
          finalAnswer = event.data.answer;
          success = event.data.stoppedReason === "complete";
          if (finalAnswer) {
            steps.push({
              iteration: event.data.totalIterations,
              thought: finalAnswer,
              toolCall: null,
              toolResult: null,
            });
          }
        } else if (event.type === "error") {
          throw new Error(event.data.message);
        }
      }

      const latencyMs = Math.round(performance.now() - start);
      const { data, summary, confidence, sources } = parseFinalAnswer(finalAnswer);

      return {
        role,
        displayName: config.displayName,
        summary,
        data,
        confidence,
        sources,
        steps,
        latencyMs,
        success,
      };
    }

    // ── Non-streaming path (unchanged behaviour) ────────────────────────────
    const result = await agent.run(query);
    const latencyMs = Math.round(performance.now() - start);
    const { data, summary, confidence, sources } = parseFinalAnswer(result.finalAnswer);

    return {
      role,
      displayName: config.displayName,
      summary,
      data,
      confidence,
      sources,
      steps: result.steps,
      latencyMs,
      success: result.success,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      role,
      displayName: config.displayName,
      summary: `Agent execution failed: ${error}`,
      data: {},
      confidence: 0,
      sources: [],
      steps: [],
      latencyMs: Math.round(performance.now() - start),
      success: false,
      error,
    };
  }
}

