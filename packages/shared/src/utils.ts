/**
 * Shared utility functions.
 */

/** Format a number as USD currency */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

/** Create a successful API response */
export function success<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

/** Create an error API response */
export function error(message: string): { success: false; error: string } {
  return { success: false, error: message };
}

