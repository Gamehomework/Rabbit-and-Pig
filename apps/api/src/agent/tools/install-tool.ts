/**
 * Install Tool: installs and enables a plugin from a given source.
 */

import { resolve } from "node:path";
import type { Tool } from "./types.js";
import type { PluginManager } from "../../plugins/manager.js";
import type { PluginSource, PluginMeta } from "../../plugins/types.js";

export interface InstallToolInput {
  toolName: string;
  source?: PluginSource;
  sourceUri?: string;
}

export function createInstallTool(pluginManager: PluginManager): Tool<InstallToolInput, PluginMeta> {
  return {
    name: "install_plugin",
    description:
      "Install a plugin by name and source type. For local plugins, defaults to apps/api/plugins/{toolName}/. After install the plugin is automatically enabled.",
    inputSchema: {
      type: "object",
      properties: {
        toolName: {
          type: "string",
          description: "Name of the plugin to install.",
        },
        source: {
          type: "string",
          enum: ["npm", "remote", "local"],
          description: 'Plugin source type. Defaults to "local".',
        },
        sourceUri: {
          type: "string",
          description:
            "Source URI (npm package name, remote URL, or local path). For local plugins defaults to apps/api/plugins/{toolName}/.",
        },
      },
      required: ["toolName"],
    },
    async execute(input: InstallToolInput): Promise<PluginMeta> {
      const source: PluginSource = input.source ?? "local";
      let uri = input.sourceUri;

      if (!uri && source === "local") {
        // Default local path relative to project root
        uri = resolve("apps/api/plugins", input.toolName, "index.ts");
      }

      if (!uri) {
        throw new Error("sourceUri is required for npm and remote sources.");
      }

      const meta = await pluginManager.install(source, uri);
      await pluginManager.enable(meta.name);
      return meta;
    },
  };
}

