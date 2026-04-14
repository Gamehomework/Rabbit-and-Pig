/**
 * Toggle Plugin Tool: enable or disable a plugin by name.
 */

import type { Tool } from "./types.js";
import type { PluginManager } from "../../plugins/manager.js";

export interface TogglePluginInput {
  toolName: string;
  action: "enable" | "disable";
}

export interface TogglePluginOutput {
  toolName: string;
  action: "enable" | "disable";
  success: boolean;
}

export function createTogglePluginTool(pluginManager: PluginManager): Tool<TogglePluginInput, TogglePluginOutput> {
  return {
    name: "toggle_plugin",
    description: "Enable or disable an installed plugin. Enabling registers its tools; disabling removes them.",
    inputSchema: {
      type: "object",
      properties: {
        toolName: {
          type: "string",
          description: "Name of the plugin to enable or disable.",
        },
        action: {
          type: "string",
          enum: ["enable", "disable"],
          description: 'Action to perform: "enable" or "disable".',
        },
      },
      required: ["toolName", "action"],
    },
    async execute(input: TogglePluginInput): Promise<TogglePluginOutput> {
      if (input.action === "enable") {
        await pluginManager.enable(input.toolName);
      } else {
        await pluginManager.disable(input.toolName);
      }

      return {
        toolName: input.toolName,
        action: input.action,
        success: true,
      };
    },
  };
}

