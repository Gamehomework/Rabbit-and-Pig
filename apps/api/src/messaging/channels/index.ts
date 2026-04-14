/**
 * Channel adapters barrel exports and factory.
 */

import type { NotificationChannel } from "../types.js";
import { TelegramAdapter } from "./telegram.js";
import { WhatsAppAdapter } from "./whatsapp.js";
import { WeChatAdapter } from "./wechat.js";

export { TelegramAdapter } from "./telegram.js";
export { WhatsAppAdapter } from "./whatsapp.js";
export { WeChatAdapter } from "./wechat.js";

/**
 * Create all channel adapters that have valid configuration.
 * Only returns adapters whose validate() reports { valid: true }.
 */
export function createDefaultChannels(): NotificationChannel[] {
  const all: NotificationChannel[] = [
    new TelegramAdapter(),
    new WhatsAppAdapter(),
    new WeChatAdapter(),
  ];

  return all.filter((ch) => ch.validate().valid);
}

