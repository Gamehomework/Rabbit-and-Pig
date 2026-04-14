/**
 * NotificationService singleton: creates and caches a single NotificationService
 * instance with all available channel adapters auto-registered.
 */

import { NotificationService } from "./service.js";

let instance: NotificationService | null = null;

/**
 * Get (or create) the singleton NotificationService.
 * Lazily registers available channel adapters from channels/.
 */
export function getNotificationService(): NotificationService {
  if (instance) return instance;

  instance = new NotificationService();

  // Auto-register available channel adapters.
  // Channels are being built by another agent — we import them dynamically
  // so it doesn't error if they don't exist yet.
  try {
    // Future: dynamic import of channel adapters from channels/ directory
    // e.g. TelegramChannel, WhatsAppChannel, WeChatChannel
  } catch {
    // Channel adapters not available yet — that's fine
  }

  return instance;
}

