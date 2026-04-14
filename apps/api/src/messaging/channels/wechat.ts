/**
 * WeChat (WeCom) channel adapter using webhook integration.
 */

import type { Message, NotificationChannel, SendResult } from "../types.js";

export class WeChatAdapter implements NotificationChannel {
  readonly channelName = "wechat";
  private readonly webhookUrl: string | undefined;

  constructor() {
    this.webhookUrl = process.env.WECOM_WEBHOOK_URL;
  }

  validate(): { valid: boolean; error?: string } {
    if (!this.webhookUrl) {
      return { valid: false, error: "WECOM_WEBHOOK_URL environment variable is not set." };
    }
    return { valid: true };
  }

  async send(message: Message): Promise<SendResult> {
    const validation = this.validate();
    if (!validation.valid) {
      return { success: false, error: validation.error, timestamp: new Date() };
    }

    try {
      const response = await fetch(this.webhookUrl!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msgtype: "markdown",
          markdown: {
            content: message.body,
          },
        }),
      });

      const data = (await response.json()) as {
        errcode?: number;
        errmsg?: string;
      };

      if (!response.ok || (data.errcode !== undefined && data.errcode !== 0)) {
        const errorMsg = data.errmsg ?? `HTTP ${response.status}`;
        return { success: false, error: errorMsg, timestamp: new Date() };
      }

      return {
        success: true,
        messageId: `wechat-${Date.now()}`,
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

