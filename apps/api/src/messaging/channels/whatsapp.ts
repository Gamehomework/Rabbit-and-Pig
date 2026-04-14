/**
 * WhatsApp channel adapter using Twilio SDK.
 */

import type { Message, NotificationChannel, SendResult } from "../types.js";
import Twilio from "twilio";

export class WhatsAppAdapter implements NotificationChannel {
  readonly channelName = "whatsapp";
  private readonly accountSid: string | undefined;
  private readonly authToken: string | undefined;
  private readonly fromNumber: string | undefined;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_WHATSAPP_FROM;
  }

  validate(): { valid: boolean; error?: string } {
    const missing: string[] = [];
    if (!this.accountSid) missing.push("TWILIO_ACCOUNT_SID");
    if (!this.authToken) missing.push("TWILIO_AUTH_TOKEN");
    if (!this.fromNumber) missing.push("TWILIO_WHATSAPP_FROM");

    if (missing.length > 0) {
      return { valid: false, error: `Missing environment variables: ${missing.join(", ")}` };
    }
    return { valid: true };
  }

  async send(message: Message): Promise<SendResult> {
    const validation = this.validate();
    if (!validation.valid) {
      return { success: false, error: validation.error, timestamp: new Date() };
    }

    try {
      const client = Twilio(this.accountSid!, this.authToken!);
      const to = message.to.startsWith("whatsapp:") ? message.to : `whatsapp:${message.to}`;
      const from = this.fromNumber!.startsWith("whatsapp:")
        ? this.fromNumber!
        : `whatsapp:${this.fromNumber!}`;

      const result = await client.messages.create({
        to,
        from,
        body: message.body,
      });

      return {
        success: true,
        messageId: result.sid,
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

