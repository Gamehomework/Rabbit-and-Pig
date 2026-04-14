// Load .env from repo root (Node 20.12+). No-op if file is missing.
try {
  const { resolve, dirname } = await import("path");
  const { fileURLToPath } = await import("url");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  process.loadEnvFile(`${root}/.env`);
} catch { /* .env not present or Node < 20.12 */ }

import Fastify from "fastify";
import cors from "@fastify/cors";
import { API_PORT, APP_NAME } from "@rabbit-and-pig/shared";
import { registerRoutes } from "./routes/index.js";
// Importing db module initializes SQLite connection + WAL mode
import "./db/index.js";

const app = Fastify({ logger: true });

// CORS — allow the frontend origin and any local dev
await app.register(cors, {
  origin: ["http://localhost:3002", "http://127.0.0.1:3002"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

// Health check
app.get("/health", async () => {
  return { status: "ok", name: APP_NAME };
});

// Register all API routes
await registerRoutes(app);

try {
  await app.listen({ port: API_PORT, host: "0.0.0.0" });
  console.log(`${APP_NAME} API running on port ${API_PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

