/**
 * Structured logging for agent decisions and tool executions.
 * Uses console.log as fallback until DB is wired up.
 */

import type { ToolResult } from "./tools/types.js";

/** Agent decision step log entry */
export interface AgentStepLog {
  iteration: number;
  thought: string | null;
  action: string | null;
  toolName: string | null;
  toolInput: unknown;
  result: unknown;
  timestamp: string;
}

/** Log an agent decision step */
export function logAgentStep(step: AgentStepLog): void {
  console.log(
    JSON.stringify({
      type: "agent_step",
      ...step,
    })
  );
}

/** Log a tool execution result */
export function logToolExecution(result: ToolResult): void {
  console.log(
    JSON.stringify({
      type: "tool_execution",
      tool_name: result.toolName,
      input: result.input,
      output: result.success ? result.output : undefined,
      latency_ms: result.latencyMs,
      success: result.success,
      error: result.error ?? undefined,
      timestamp: new Date().toISOString(),
    })
  );
}

/** Log agent session start */
export function logAgentStart(sessionId: string, query: string): void {
  console.log(
    JSON.stringify({
      type: "agent_start",
      sessionId,
      query,
      timestamp: new Date().toISOString(),
    })
  );
}

/** Log agent session end */
export function logAgentEnd(
  sessionId: string,
  finalAnswer: string | null,
  totalIterations: number,
  success: boolean
): void {
  console.log(
    JSON.stringify({
      type: "agent_end",
      sessionId,
      finalAnswer,
      totalIterations,
      success,
      timestamp: new Date().toISOString(),
    })
  );
}

