/**
 * PluginManager: orchestrates plugin lifecycle (install, enable, disable, uninstall).
 */

import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { ToolRegistry } from "../agent/tools/registry.js";
import type { PluginDefinition, PluginMeta, PluginSource } from "./types.js";
import { PluginRegistry } from "./registry.js";
import { PluginLoader } from "./loader.js";

export class PluginManager {
  private activePlugins = new Map<string, PluginDefinition>();
  private registry: PluginRegistry;
  private loader: PluginLoader;
  private toolRegistry: ToolRegistry;

  constructor(pluginRegistry: PluginRegistry, toolRegistry: ToolRegistry) {
    this.registry = pluginRegistry;
    this.toolRegistry = toolRegistry;
    this.loader = new PluginLoader();
  }

  /** Install a plugin from the given source. */
  async install(source: PluginSource, nameOrUri: string): Promise<PluginMeta> {
    let definition: PluginDefinition;

    switch (source) {
      case "local":
        definition = await this.loader.loadLocal(nameOrUri);
        break;
      case "npm":
        definition = await this.loader.loadNpm(nameOrUri);
        break;
      case "remote":
        definition = await this.loader.loadRemote(nameOrUri);
        break;
      default:
        throw new Error(`Unknown plugin source: ${source}`);
    }

    // Call onInstall lifecycle hook if present
    if (definition.onInstall) {
      await definition.onInstall();
    }

    // Save to DB
    await this.registry.save({
      name: definition.meta.name,
      description: definition.meta.description,
      version: definition.meta.version,
      source: definition.meta.source,
      sourceUri: nameOrUri,
      status: "installed",
    });

    // Keep in memory
    this.activePlugins.set(definition.meta.name, definition);

    return definition.meta;
  }

  /** Enable a plugin: register its tools in the ToolRegistry. */
  async enable(name: string): Promise<void> {
    const definition = this.activePlugins.get(name);
    if (!definition) {
      throw new Error(`Plugin "${name}" is not loaded. Install it first.`);
    }

    // Register whitelisted tools
    for (const tool of definition.tools) {
      const allowed = await this.isWhitelisted(tool.name);
      if (!allowed) {
        continue;
      }
      if (!this.toolRegistry.has(tool.name)) {
        this.toolRegistry.register(tool);
      }
    }

    // Call onEnable lifecycle hook
    if (definition.onEnable) {
      await definition.onEnable();
    }

    await this.registry.updateStatus(name, "enabled");
  }

  /** Disable a plugin: unregister its tools from the ToolRegistry. */
  async disable(name: string): Promise<void> {
    const definition = this.activePlugins.get(name);
    if (!definition) {
      throw new Error(`Plugin "${name}" is not loaded.`);
    }

    for (const tool of definition.tools) {
      this.toolRegistry.unregister(tool.name);
    }

    // Call onDisable lifecycle hook
    if (definition.onDisable) {
      await definition.onDisable();
    }

    await this.registry.updateStatus(name, "disabled");
  }

  /** Uninstall a plugin: disable, call onUninstall, remove from DB. */
  async uninstall(name: string): Promise<void> {
    const definition = this.activePlugins.get(name);

    // Disable first if it's loaded
    if (definition) {
      await this.disable(name);

      if (definition.onUninstall) {
        await definition.onUninstall();
      }
    }

    this.activePlugins.delete(name);
    await this.registry.remove(name);
  }

  /** Check if a tool name is allowed by the whitelist. */
  async isWhitelisted(toolName: string): Promise<boolean> {
    const rows = await db
      .select()
      .from(schema.toolWhitelist)
      .where(eq(schema.toolWhitelist.toolName, toolName))
      .limit(1);

    // If not in whitelist table, allow by default
    if (rows.length === 0) {
      return true;
    }

    return rows[0]!.allowed;
  }

  /** Get a loaded plugin definition by name. */
  getActive(name: string): PluginDefinition | undefined {
    return this.activePlugins.get(name);
  }

  /** List all active (in-memory) plugin names. */
  listActive(): string[] {
    return Array.from(this.activePlugins.keys());
  }
}

