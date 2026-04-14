/**
 * AgentPool: manages specialist agent configurations and executes them
 * by wrapping the existing ReAct Agent class.
 */

import { Agent } from "../agent/core.js";
import { ToolRegistry } from "../agent/tools/registry.js";
import type { Tool } from "../agent/tools/types.js";
import type { AgentRoleConfig, AgentOutput, AgentRole } from "./types.js";
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

/**
 * Execute a specialist agent by role.
 * Creates a ReAct Agent with the role-specific system prompt and tools,
 * runs it, and returns a structured AgentOutput.
 */
export async function runSpecialistAgent(
  role: AgentRole,
  query: string,
  context?: Record<string, unknown>,
  urls?: string[],
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
    const agent = new Agent(registry, {
      systemPrompt,
      maxIterations: config.maxIterations,
    });

    const result = await agent.run(query);
    const latencyMs = Math.round(performance.now() - start);

    // Try to parse the final answer as structured JSON
    let data: Record<string, unknown> = {};
    let summary = result.finalAnswer ?? "No response from agent.";
    let confidence = 0.5;
    let sources: string[] = [];

    if (result.finalAnswer) {
      try {
        // Try to extract JSON from the response
        const jsonMatch = result.finalAnswer.match(/```json\s*([\s\S]*?)```/) 
          ?? result.finalAnswer.match(/\{[\s\S]*\}/);
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
        data = { rawText: result.finalAnswer };
      }
    }

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

