/**
 * Plugin management routes: install, enable, disable, uninstall, and list plugins.
 */

import type { FastifyInstance } from "fastify";
import { ToolRegistry } from "../agent/tools/registry.js";
import { getPluginManager } from "../plugins/instance.js";
import { PluginRegistry } from "../plugins/registry.js";
import type { PluginSource } from "../plugins/types.js";

export async function pluginRoutes(app: FastifyInstance) {
  // We need a ToolRegistry to pass to the PluginManager singleton.
  // In production, this should be the same registry used by the agent.
  // For now, create a shared one via the singleton factory.
  const toolRegistry = new ToolRegistry();
  const pm = getPluginManager(toolRegistry);
  const pluginRegistry = new PluginRegistry();

  /** GET /api/plugins — list all plugins */
  app.get("/api/plugins", async () => {
    const plugins = await pluginRegistry.list();
    return {
      plugins: plugins.map((p) => ({
        name: p.name,
        status: p.status,
        version: p.version,
        source: p.source,
        description: p.description,
      })),
    };
  });

  /** POST /api/plugins/install — install a plugin */
  app.post<{
    Body: { name: string; source?: PluginSource; sourceUri?: string };
  }>("/api/plugins/install", {
    schema: {
      body: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          source: { type: "string", enum: ["npm", "remote", "local"] },
          sourceUri: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const { name, source = "local", sourceUri } = request.body;

      try {
        const { resolve } = await import("node:path");
        let uri = sourceUri;
        if (!uri && source === "local") {
          uri = resolve("apps/api/plugins", name, "index.ts");
        }
        if (!uri) {
          return reply.status(400).send({ error: "sourceUri is required for npm and remote sources." });
        }

        const meta = await pm.install(source, uri);
        return { success: true, plugin: meta };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Install failed";
        request.log.error(err, "Plugin install error");
        return reply.status(500).send({ error: message });
      }
    },
  });

  /** POST /api/plugins/:name/enable — enable a plugin */
  app.post<{ Params: { name: string } }>("/api/plugins/:name/enable", async (request, reply) => {
    try {
      await pm.enable(request.params.name);
      return { success: true, name: request.params.name, status: "enabled" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Enable failed";
      request.log.error(err, "Plugin enable error");
      return reply.status(500).send({ error: message });
    }
  });

  /** POST /api/plugins/:name/disable — disable a plugin */
  app.post<{ Params: { name: string } }>("/api/plugins/:name/disable", async (request, reply) => {
    try {
      await pm.disable(request.params.name);
      return { success: true, name: request.params.name, status: "disabled" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Disable failed";
      request.log.error(err, "Plugin disable error");
      return reply.status(500).send({ error: message });
    }
  });

  /** DELETE /api/plugins/:name — uninstall a plugin */
  app.delete<{ Params: { name: string } }>("/api/plugins/:name", async (request, reply) => {
    try {
      await pm.uninstall(request.params.name);
      return { success: true, name: request.params.name, status: "uninstalled" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Uninstall failed";
      request.log.error(err, "Plugin uninstall error");
      return reply.status(500).send({ error: message });
    }
  });
}

