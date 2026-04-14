import Fastify from "fastify";
import cors from "@fastify/cors";
import { API_PORT, APP_NAME } from "@rabbit-and-pig/shared";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get("/health", async () => {
  return { status: "ok", name: APP_NAME };
});

try {
  await app.listen({ port: API_PORT, host: "0.0.0.0" });
  console.log(`${APP_NAME} API running on port ${API_PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

