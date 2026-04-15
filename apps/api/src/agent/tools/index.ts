/**
 * Tool system barrel exports.
 */

export type { Tool, ToolResult, FunctionDefinition, JsonSchema } from "./types.js";
export { ToolRegistry } from "./registry.js";
export { echoTool } from "./echo.js";
export { screenerTool } from "./screener.js";
export { chartTool } from "./chart.js";
export { newsTool } from "./news.js";
export { notesTool } from "./notes.js";
export { createInstallTool } from "./install-tool.js";
export { createListPluginsTool } from "./list-plugins.js";
export { createTogglePluginTool } from "./toggle-plugin.js";
export { sendMessageTool } from "./send-message.js";
export { backtestTool } from "./backtest.js";

import { ToolRegistry } from "./registry.js";
import { echoTool } from "./echo.js";
import { screenerTool } from "./screener.js";
import { chartTool } from "./chart.js";
import { getPluginManager } from "../../plugins/instance.js";
import { createInstallTool } from "./install-tool.js";
import { createListPluginsTool } from "./list-plugins.js";
import { createTogglePluginTool } from "./toggle-plugin.js";
import { sendMessageTool } from "./send-message.js";
import { backtestTool } from "./backtest.js";

/** Create a ToolRegistry with all built-in tools pre-registered. */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(echoTool);
  registry.register(screenerTool);
  registry.register(chartTool);

  // Register plugin management tools
  const pm = getPluginManager(registry);
  registry.register(createInstallTool(pm));
  registry.register(createListPluginsTool(pm));
  registry.register(createTogglePluginTool(pm));

  // Register messaging tool
  registry.register(sendMessageTool);

  // Register backtest tool
  registry.register(backtestTool);

  return registry;
}

