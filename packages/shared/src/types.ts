/**
 * Shared type definitions for the Stock Research Agent.
 */

/** API response wrapper */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Stock ticker symbol */
export type TickerSymbol = string;

