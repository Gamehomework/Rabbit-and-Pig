/**
 * LLM client utilities: exponential backoff retry for API calls.
 */

/** Options for retry behavior */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms before first retry (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default: 30000) */
  maxDelayMs?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 30_000;

/** Check if an error is retryable (429, 5xx, or network error). */
function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    // Network errors
    if (
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("etimedout") ||
      message.includes("fetch failed") ||
      message.includes("network")
    ) {
      return true;
    }
  }

  // OpenAI SDK wraps HTTP errors with a `status` property
  const status = (err as { status?: number })?.status;
  if (typeof status === "number") {
    // 429 = rate limit, 5xx = server errors
    return status === 429 || status >= 500;
  }

  return false;
}

/** Extract retry-after hint from error (seconds), if available. */
function getRetryAfterMs(err: unknown): number | null {
  const headers = (err as { headers?: Record<string, string> })?.headers;
  if (headers?.["retry-after"]) {
    const seconds = Number(headers["retry-after"]);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }
  return null;
}

/**
 * Execute an async function with exponential backoff retry.
 * Only retries on 429, 5xx, and network errors. Other 4xx errors are thrown immediately.
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelay = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelay = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Don't retry if not retryable or we've exhausted attempts
      if (!isRetryable(err) || attempt >= maxRetries) {
        throw err;
      }

      // Calculate delay: exponential backoff with jitter
      const retryAfter = getRetryAfterMs(err);
      const exponentialDelay = baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * baseDelay * 0.5;
      const delay = retryAfter
        ? Math.max(retryAfter, exponentialDelay)
        : Math.min(exponentialDelay + jitter, maxDelay);

      console.warn(
        `[llm-client] Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms — ${err instanceof Error ? err.message : String(err)}`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Should not reach here, but just in case
  throw lastError;
}

