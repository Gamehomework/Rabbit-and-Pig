/**
 * In-memory token bucket rate limiter for notification channels.
 */

export interface RateLimiterConfig {
  /** Maximum tokens in the bucket (default: 10) */
  maxTokens?: number;
  /** Tokens added per minute (default: 10) */
  refillRate?: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(config: RateLimiterConfig = {}) {
    this.maxTokens = config.maxTokens ?? 10;
    this.refillRate = config.refillRate ?? 10;
  }

  /**
   * Build the rate-limit key from channel name and optional user ID.
   */
  static key(channelName: string, userId?: string): string {
    return `${channelName}:${userId ?? "default"}`;
  }

  /**
   * Try to consume one token from the bucket for the given key.
   * Returns true if a token was consumed, false if rate-limited.
   */
  tryConsume(key: string): boolean {
    this.refill(key);
    const bucket = this.getBucket(key);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Get the number of remaining tokens for the given key.
   */
  getRemainingTokens(key: string): number {
    this.refill(key);
    return this.getBucket(key).tokens;
  }

  private getBucket(key: string): Bucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: Date.now() };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private refill(key: string): void {
    const bucket = this.getBucket(key);
    const now = Date.now();
    const elapsedMs = now - bucket.lastRefill;
    const elapsedMinutes = elapsedMs / 60_000;
    const tokensToAdd = elapsedMinutes * this.refillRate;

    if (tokensToAdd >= 1) {
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }
}

