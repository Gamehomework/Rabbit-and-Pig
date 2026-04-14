/**
 * Plugin system type definitions.
 */

import type { Tool } from "../agent/tools/types.js";

/** Where a plugin was loaded from */
export type PluginSource = "npm" | "remote" | "local";

/** Plugin lifecycle status */
export type PluginStatus = "installed" | "enabled" | "disabled" | "error";

/** Plugin metadata */
export interface PluginMeta {
  name: string;
  description: string;
  version: string;
  author?: string;
  source: PluginSource;
  sourceUri: string; // npm package name, URL, or local path
}

/** Full plugin definition returned by a plugin module */
export interface PluginDefinition {
  meta: PluginMeta;
  tools: Tool[];
  onInstall?(): Promise<void>;
  onEnable?(): Promise<void>;
  onDisable?(): Promise<void>;
  onUninstall?(): Promise<void>;
}

