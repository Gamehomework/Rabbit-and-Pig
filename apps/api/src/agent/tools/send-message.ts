/**
 * Send Message Tool: sends a notification via Telegram, WhatsApp, or WeChat
 * through the NotificationService and logs the result to notification_history.
 */

import { getNotificationService } from "../../messaging/instance.js";
import { db, schema } from "../../db/index.js";
import type { Tool } from "./types.js";

export interface SendMessageInput {
  channel: "telegram" | "whatsapp" | "wechat";
  message: string;
  recipient?: string;
}

export interface SendMessageOutput {
  success: boolean;
  channel: string;
  messageId?: string;
  error?: string;
}

export const sendMessageTool: Tool<SendMessageInput, SendMessageOutput> = {
  name: "send_message",
  description:
    "Send a notification message via Telegram, WhatsApp, or WeChat.",
  inputSchema: {
    type: "object",
    properties: {
      channel: {
        type: "string",
        enum: ["telegram", "whatsapp", "wechat"],
        description: "The notification channel to use.",
      },
      message: {
        type: "string",
        description: "The message body to send.",
      },
      recipient: {
        type: "string",
        description:
          "Optional recipient identifier. Uses default if omitted.",
      },
    },
    required: ["channel", "message"],
  },

  async execute(input: SendMessageInput): Promise<SendMessageOutput> {
    const service = getNotificationService();
    const recipient = input.recipient ?? "default";

    const result = await service.send(input.channel, {
      to: recipient,
      body: input.message,
    });

    // Determine status for history log
    let status: string;
    if (result.success) {
      status = "sent";
    } else if (result.error?.includes("Rate limit")) {
      status = "rate_limited";
    } else {
      status = "failed";
    }

    // Log to notification_history
    try {
      await db.insert(schema.notificationHistory).values({
        channelType: input.channel,
        recipient,
        message: input.message,
        status,
        error: result.error ?? null,
      });
    } catch {
      // Don't fail the tool if logging fails
    }

    return {
      success: result.success,
      channel: input.channel,
      messageId: result.messageId,
      error: result.error,
    };
  },
};

