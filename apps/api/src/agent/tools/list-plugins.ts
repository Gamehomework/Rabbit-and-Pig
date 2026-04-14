/**
 * List Plugins Tool: returns all plugins from the PluginRegistry with their status.
 */

import type { Tool } from "./types.js";
import type { PluginManager } from "../../plugins/manager.js";
import { PluginRegistry, type PluginRecord } from "../../plugins/registry.js";

export interface ListPluginsOutput {
  plugins: PluginRecord[];
}

export function createListPluginsTool(pluginManager: PluginManager): Tool<Record<string, never>, ListPluginsOutput> {
  // We need a PluginRegistry instance to list from DB
  const registry = new PluginRegistry();

  return {
    name: "list_plugins",
    description: "List all installed plugins with their name, version, source, status, and description.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    async execute(): Promise<ListPluginsOutput> {
      const plugins = await registry.list();
      return { plugins };
    },
  };
}

