/**
 * Notification management endpoints.
 */

import type { FastifyInstance } from "fastify";
import { db, schema } from "../db/index.js";
import { desc } from "drizzle-orm";
import { getNotificationService } from "../messaging/instance.js";

export async function notificationRoutes(app: FastifyInstance) {
  // GET /api/notifications/channels — list configured channels from DB
  app.get("/api/notifications/channels", async () => {
    const rows = await db
      .select()
      .from(schema.notificationChannels)
      .orderBy(schema.notificationChannels.createdAt);
    return rows.map((r) => ({
      ...r,
      config: JSON.parse(r.config),
    }));
  });

  // POST /api/notifications/channels — save channel config
  app.post<{
    Body: { channelType: string; config: Record<string, unknown>; isDefault?: boolean };
  }>("/api/notifications/channels", {
    schema: {
      body: {
        type: "object",
        required: ["channelType", "config"],
        properties: {
          channelType: { type: "string", minLength: 1 },
          config: { type: "object" },
          isDefault: { type: "boolean" },
        },
      },
    },
    handler: async (request, reply) => {
      try {
        const { channelType, config, isDefault } = request.body;
        const [row] = await db
          .insert(schema.notificationChannels)
          .values({
            channelType,
            config: JSON.stringify(config),
            isDefault: isDefault ?? false,
          })
          .returning();
        return reply.status(201).send({ ...row, config: JSON.parse(row.config) });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save channel config";
        request.log.error(err, "Save channel config error");
        return reply.status(500).send({ error: message, statusCode: 500 });
      }
    },
  });

  // POST /api/notifications/send — manual send
  app.post<{
    Body: { channel: string; message: string; recipient?: string };
  }>("/api/notifications/send", {
    schema: {
      body: {
        type: "object",
        required: ["channel", "message"],
        properties: {
          channel: { type: "string", minLength: 1 },
          message: { type: "string", minLength: 1 },
          recipient: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      try {
        const { channel, message, recipient } = request.body;
        const service = getNotificationService();
        const to = recipient ?? "default";

        const result = await service.send(channel, { to, body: message });

        // Determine status
        let status: string;
        if (result.success) {
          status = "sent";
        } else if (result.error?.includes("Rate limit")) {
          status = "rate_limited";
        } else {
          status = "failed";
        }

        // Log to history
        await db.insert(schema.notificationHistory).values({
          channelType: channel,
          recipient: to,
          message,
          status,
          error: result.error ?? null,
        });

        return reply.send({
          success: result.success,
          channel,
          messageId: result.messageId,
          error: result.error,
          status,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Send failed";
        request.log.error(err, "Notification send error");
        return reply.status(500).send({ error: message, statusCode: 500 });
      }
    },
  });

  // GET /api/notifications/history — notification history
  app.get<{
    Querystring: { limit?: string };
  }>("/api/notifications/history", async (request) => {
    const limit = Math.min(parseInt(request.query.limit ?? "50", 10) || 50, 200);
    return db
      .select()
      .from(schema.notificationHistory)
      .orderBy(desc(schema.notificationHistory.sentAt))
      .limit(limit);
  });
}

