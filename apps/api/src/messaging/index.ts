/**
 * Messaging module barrel exports.
 */

export type { Message, SendResult, NotificationChannel } from "./types.js";
export { RateLimiter } from "./rate-limiter.js";
export type { RateLimiterConfig } from "./rate-limiter.js";
export { NotificationService } from "./service.js";
export type { NotificationServiceConfig } from "./service.js";

