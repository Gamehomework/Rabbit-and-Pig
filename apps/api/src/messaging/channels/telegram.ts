/**
 * Telegram channel adapter using the Bot API with native fetch.
 */

import type { Message, NotificationChannel, SendResult } from "../types.js";

const TELEGRAM_API = "https://api.telegram.org";

export class TelegramAdapter implements NotificationChannel {
  readonly channelName = "telegram";
  private readonly token: string | undefined;

  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
  }

  validate(): { valid: boolean; error?: string } {
    if (!this.token) {
      return { valid: false, error: "TELEGRAM_BOT_TOKEN environment variable is not set." };
    }
    return { valid: true };
  }

  async send(message: Message): Promise<SendResult> {
    const validation = this.validate();
    if (!validation.valid) {
      return { success: false, error: validation.error, timestamp: new Date() };
    }

    const url = `${TELEGRAM_API}/bot${this.token}/sendMessage`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: message.to,
          text: message.body,
          parse_mode: "Markdown",
        }),
      });

      const data = (await response.json()) as {
        ok: boolean;
        result?: { message_id: number };
        description?: string;
        error_code?: number;
      };

      if (!response.ok || !data.ok) {
        const errorMsg = data.description ?? `HTTP ${response.status}`;
        // Map known Telegram error codes
        if (data.error_code === 401) {
          return { success: false, error: `Invalid bot token: ${errorMsg}`, timestamp: new Date() };
        }
        if (data.error_code === 400 && errorMsg.includes("chat not found")) {
          return { success: false, error: `Chat not found: ${errorMsg}`, timestamp: new Date() };
        }
        if (data.error_code === 429) {
          return { success: false, error: `Rate limited by Telegram: ${errorMsg}`, timestamp: new Date() };
        }
        return { success: false, error: errorMsg, timestamp: new Date() };
      }

      return {
        success: true,
        messageId: String(data.result?.message_id),
        timestamp: new Date(),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date(),
      };
    }
  }
}

