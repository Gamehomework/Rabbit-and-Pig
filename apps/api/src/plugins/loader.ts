/**
 * PluginLoader: load plugin definitions from local, npm, or remote sources.
 */

import { resolve } from "node:path";
import type { PluginDefinition } from "./types.js";
import type { JsonSchema } from "../agent/tools/types.js";

/** Validate that a module export looks like a PluginDefinition. */
function validatePluginDefinition(mod: unknown, label: string): PluginDefinition {
  const obj = mod as Record<string, unknown>;
  // Support both default export and named `plugin` export
  const def = (obj.default ?? obj.plugin ?? obj) as Record<string, unknown>;

  if (!def || typeof def !== "object") {
    throw new Error(`${label}: module does not export a valid PluginDefinition`);
  }

  const meta = def.meta as Record<string, unknown> | undefined;
  if (!meta || typeof meta.name !== "string" || typeof meta.version !== "string") {
    throw new Error(`${label}: missing or invalid meta (need name, version)`);
  }

  if (!Array.isArray(def.tools)) {
    throw new Error(`${label}: missing tools array`);
  }

  return def as unknown as PluginDefinition;
}

export class PluginLoader {
  /** Load a plugin from a local directory path. */
  async loadLocal(path: string): Promise<PluginDefinition> {
    const absPath = resolve(path);
    const mod = await import(absPath);
    return validatePluginDefinition(mod, `local plugin at ${path}`);
  }

  /** Load a plugin from an installed npm package. */
  async loadNpm(packageName: string): Promise<PluginDefinition> {
    const mod = await import(packageName);
    return validatePluginDefinition(mod, `npm plugin "${packageName}"`);
  }

  /** Load a remote plugin by creating proxy tools that call the remote API. */
  async loadRemote(endpoint: string): Promise<PluginDefinition> {
    // Fetch the plugin manifest from the remote endpoint
    const res = await fetch(`${endpoint}/manifest`);
    if (!res.ok) {
      throw new Error(`Remote plugin at ${endpoint}: failed to fetch manifest (${res.status})`);
    }

    const manifest = (await res.json()) as {
      meta: PluginDefinition["meta"];
      tools: Array<{ name: string; description: string; inputSchema: JsonSchema }>;
    };

    // Create proxy tools that forward execution to the remote endpoint
    const proxyTools = manifest.tools.map((toolDef) => ({
      name: toolDef.name,
      description: toolDef.description,
      inputSchema: toolDef.inputSchema,
      async execute(input: unknown): Promise<unknown> {
        const toolRes = await fetch(`${endpoint}/tools/${toolDef.name}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!toolRes.ok) {
          throw new Error(`Remote tool "${toolDef.name}" failed (${toolRes.status})`);
        }
        return toolRes.json();
      },
    }));

    return {
      meta: manifest.meta,
      tools: proxyTools,
    };
  }
}

