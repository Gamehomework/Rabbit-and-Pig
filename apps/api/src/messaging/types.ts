/**
 * Core messaging types for the notification/channel system.
 */

/** A message to be sent through a notification channel. */
export interface Message {
  /** Recipient identifier (email, phone, user ID, etc.) */
  to: string;
  /** Optional subject line */
  subject?: string;
  /** Message body content */
  body: string;
  /** Arbitrary metadata for channel-specific options */
  metadata?: Record<string, unknown>;
}

/** Result of sending a message through a channel. */
export interface SendResult {
  /** Whether the send was successful */
  success: boolean;
  /** Unique message identifier (set on success) */
  messageId?: string;
  /** Error description (set on failure) */
  error?: string;
  /** Timestamp of the send attempt */
  timestamp: Date;
}

/** Interface that all notification channel adapters must implement. */
export interface NotificationChannel {
  /** Unique channel name (e.g. "email", "sms", "slack") */
  readonly channelName: string;
  /** Send a message through this channel. */
  send(message: Message): Promise<SendResult>;
  /** Validate that the channel is properly configured. */
  validate(): { valid: boolean; error?: string };
}

