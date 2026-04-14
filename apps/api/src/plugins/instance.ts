/**
 * PluginManager singleton factory.
 * Ensures a single PluginManager instance is shared across routes and tools.
 */

import type { ToolRegistry } from "../agent/tools/registry.js";
import { PluginManager } from "./manager.js";
import { PluginRegistry } from "./registry.js";

let instance: PluginManager | null = null;

/** Get or create the singleton PluginManager. */
export function getPluginManager(toolRegistry: ToolRegistry): PluginManager {
  if (!instance) {
    const pluginRegistry = new PluginRegistry();
    instance = new PluginManager(pluginRegistry, toolRegistry);
  }
  return instance;
}

