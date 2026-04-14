/**
 * Tool system barrel exports.
 */

export type { Tool, ToolResult, FunctionDefinition, JsonSchema } from "./types.js";
export { ToolRegistry } from "./registry.js";
export { echoTool } from "./echo.js";
export { screenerTool } from "./screener.js";
export { chartTool } from "./chart.js";

import { ToolRegistry } from "./registry.js";
import { echoTool } from "./echo.js";
import { screenerTool } from "./screener.js";
import { chartTool } from "./chart.js";

/** Create a ToolRegistry with all built-in tools pre-registered. */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(echoTool);
  registry.register(screenerTool);
  registry.register(chartTool);
  return registry;
}export { newsTool } from "./news.js";
export { notesTool } from "./notes.js";

