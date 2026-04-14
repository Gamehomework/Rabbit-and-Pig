/**
 * Plugin system barrel exports.
 */

export type {
  PluginSource,
  PluginStatus,
  PluginMeta,
  PluginDefinition,
} from "./types.js";
export { PluginRegistry } from "./registry.js";
export type { PluginRecord } from "./registry.js";
export { PluginLoader } from "./loader.js";
export { PluginManager } from "./manager.js";
export { getPluginManager } from "./instance.js";

