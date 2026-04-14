/**
 * Multi-Agent System barrel exports.
 */

export type {
  AgentRole,
  AgentRoleConfig,
  AgentOutput,
  InvokeAgentInput,
  MultiAgentStreamEvent,
} from "./types.js";

export { AGENT_ROLES, COORDINATOR_SYSTEM_PROMPT } from "./roles.js";
export { runSpecialistAgent, registerSharedTool, clearSharedTools } from "./pool.js";
export { createInvokeAgentTool } from "./invoke-agent-tool.js";
export { runCoordinator, runCoordinatorStream } from "./coordinator.js";

