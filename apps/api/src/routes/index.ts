/**
 * Route registration: registers all API route plugins with the Fastify instance.
 */

import type { FastifyInstance } from "fastify";
import { agentRoutes } from "./agent.js";
import { stockRoutes } from "./stocks.js";
import { notesRoutes } from "./notes.js";
import { logsRoutes } from "./logs.js";

export async function registerRoutes(app: FastifyInstance) {
  await app.register(agentRoutes);
  await app.register(stockRoutes);
  await app.register(notesRoutes);
  await app.register(logsRoutes);
}

