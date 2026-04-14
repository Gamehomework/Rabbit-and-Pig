/**
 * NotificationService: manages notification channels and dispatches messages
 * with rate limiting and retry logic.
 */

import type { Message, NotificationChannel, SendResult } from "./types.js";
import { RateLimiter } from "./rate-limiter.js";
import type { RateLimiterConfig } from "./rate-limiter.js";

export interface NotificationServiceConfig {
  /** Rate limiter configuration */
  rateLimiter?: RateLimiterConfig;
  /** Number of retries on transient failures (default: 1) */
  maxRetries?: number;
}

export class NotificationService {
  private readonly channels = new Map<string, NotificationChannel>();
  private readonly rateLimiter: RateLimiter;
  private readonly maxRetries: number;

  constructor(config: NotificationServiceConfig = {}) {
    this.rateLimiter = new RateLimiter(config.rateLimiter);
    this.maxRetries = config.maxRetries ?? 1;
  }

  /** Register a notification channel adapter. Throws if name already registered. */
  registerChannel(adapter: NotificationChannel): void {
    if (this.channels.has(adapter.channelName)) {
      throw new Error(`Channel "${adapter.channelName}" is already registered.`);
    }
    this.channels.set(adapter.channelName, adapter);
  }

  /** Get a registered channel by name. */
  getChannel(name: string): NotificationChannel | undefined {
    return this.channels.get(name);
  }

  /** List all registered channel names. */
  listChannels(): string[] {
    return Array.from(this.channels.keys());
  }

  /**
   * Send a message through the named channel.
   * Checks rate limits and retries once on transient failures.
   */
  async send(
    channelName: string,
    message: Message,
    userId?: string,
  ): Promise<SendResult> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      return {
        success: false,
        error: `Channel "${channelName}" is not registered.`,
        timestamp: new Date(),
      };
    }

    // Check rate limit
    const key = RateLimiter.key(channelName, userId);
    if (!this.rateLimiter.tryConsume(key)) {
      const remaining = this.rateLimiter.getRemainingTokens(key);
      return {
        success: false,
        error: `Rate limit exceeded for channel "${channelName}". Remaining tokens: ${remaining}`,
        timestamp: new Date(),
      };
    }

    // Attempt send with retry
    let lastError: string | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await channel.send(message);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        // Only retry if we have attempts left
        if (attempt < this.maxRetries) {
          continue;
        }
      }
    }

    return {
      success: false,
      error: `Send failed after ${this.maxRetries + 1} attempt(s): ${lastError}`,
      timestamp: new Date(),
    };
  }
}

