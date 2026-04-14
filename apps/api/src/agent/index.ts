/**
 * Agent system barrel exports.
 */

export { Agent, DEFAULT_SYSTEM_PROMPT } from "./core.js";
export type { AgentConfig, AgentRunResult, AgentStep, AgentStreamEvent } from "./core.js";
export { ToolRegistry, echoTool, newsTool, notesTool } from "./tools/index.js";
export type { Tool, ToolResult, FunctionDefinition, JsonSchema } from "./tools/index.js";
export { logAgentStep, logToolExecution, logAgentStart, logAgentEnd } from "./logger.js";
export type { AgentStepLog } from "./logger.js";

