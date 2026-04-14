/**
 * Route registration: registers all API route plugins with the Fastify instance.
 */

import type { FastifyInstance } from "fastify";
import { agentRoutes } from "./agent.js";
import { stockRoutes } from "./stocks.js";
import { notesRoutes } from "./notes.js";
import { logsRoutes } from "./logs.js";
import { pluginRoutes } from "./plugins.js";
import { notificationRoutes } from "./notifications.js";
import { analyticsRoutes } from "./analytics.js";
import { optimizerRoutes } from "./optimizer.js";
import { multiAgentRoutes } from "./multi-agent.js";

export async function registerRoutes(app: FastifyInstance) {
  await app.register(agentRoutes);
  await app.register(stockRoutes);
  await app.register(notesRoutes);
  await app.register(logsRoutes);
  await app.register(pluginRoutes);
  await app.register(notificationRoutes);
  await app.register(analyticsRoutes);
  await app.register(optimizerRoutes);
  await app.register(multiAgentRoutes);
}

