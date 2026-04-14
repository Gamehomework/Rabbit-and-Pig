/**
 * Multi-Agent System types.
 * Builds on top of the existing ReAct Agent core.
 */

import type { AgentStep } from "../agent/core.js";

/** Supported agent roles */
export type AgentRole =
  | "coordinator"
  | "news_crawler"
  | "fundamental"
  | "quant"
  | "strategist"
  | "decision_maker"
  | "visualizer";

/** Configuration for a specialist agent role */
export interface AgentRoleConfig {
  role: AgentRole;
  /** Display name for the UI */
  displayName: string;
  /** System prompt for this agent */
  systemPrompt: string;
  /** Tool names this agent has access to (looked up from the shared tool set) */
  toolNames: string[];
  /** Max ReAct iterations for this agent */
  maxIterations: number;
  /** Description shown to the Coordinator so it knows when to invoke this agent */
  description: string;
}

/** Input to invoke a specialist agent (used by the invoke_agent tool) */
export interface InvokeAgentInput {
  role: AgentRole;
  query: string;
  context?: Record<string, unknown>;
  urls?: string[];
}

/** Structured output from a specialist agent */
export interface AgentOutput {
  role: AgentRole;
  displayName: string;
  summary: string;
  data: Record<string, unknown>;
  confidence: number;
  sources: string[];
  steps: AgentStep[];
  latencyMs: number;
  success: boolean;
  error?: string;
}

/** Events emitted during multi-agent streaming */
export type MultiAgentStreamEvent =
  | { type: "session"; data: { sessionId: number } }
  | { type: "agent_start"; data: { role: AgentRole; displayName: string; query: string } }
  | { type: "agent_step"; data: { role: AgentRole; iteration: number; thought: string | null; toolName?: string; toolInput?: unknown } }
  | { type: "agent_tool_result"; data: { role: AgentRole; iteration: number; toolName: string; success: boolean; output: unknown } }
  | { type: "agent_result"; data: AgentOutput }
  | { type: "coordinator_thought"; data: { iteration: number; thought: string } }
  | { type: "final_report"; data: { summary: string; agentOutputs: AgentOutput[]; totalLatencyMs: number } }
  | { type: "error"; data: { message: string } };

