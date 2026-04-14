/**
 * Chart Data Tool: fetches historical OHLCV data via yahoo-finance2.
 */

import YahooFinance from "yahoo-finance2";
import type { Tool } from "./types.js";

const yf = new YahooFinance();

/** Map user-friendly range strings to chart period1 offsets. */
const RANGE_TO_DAYS: Record<string, number> = {
  "1d": 1,
  "5d": 5,
  "1mo": 30,
  "3mo": 90,
  "6mo": 180,
  "1y": 365,
  "2y": 730,
  "5y": 1825,
};

export type ChartRange = "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y";

export interface ChartInput {
  symbol: string;
  range: ChartRange;
}

export interface ChartOutputItem {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export const chartTool: Tool<ChartInput, ChartOutputItem[]> = {
  name: "chart_data",
  description:
    "Fetch historical OHLCV (open, high, low, close, volume) price data for a stock symbol over a given time range.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "Stock ticker symbol (e.g. 'AAPL', 'MSFT').",
      },
      range: {
        type: "string",
        description:
          "Time range for historical data: '1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', or '5y'.",
        enum: ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"],
      },
    },
    required: ["symbol", "range"],
  },

  async execute(input: ChartInput): Promise<ChartOutputItem[]> {
    const days = RANGE_TO_DAYS[input.range];
    if (!days) {
      throw new Error(
        `Invalid range "${input.range}". Must be one of: ${Object.keys(RANGE_TO_DAYS).join(", ")}`,
      );
    }

    const period1 = new Date();
    period1.setDate(period1.getDate() - days);

    // Pick appropriate interval based on range
    let interval: "1d" | "1h" | "5m" = "1d";
    if (days <= 1) interval = "5m";
    else if (days <= 5) interval = "1h";

    try {
      const result = await yf.chart(input.symbol.toUpperCase(), {
        period1,
        interval,
      });

      return result.quotes.map((q) => ({
        date: q.date.toISOString(),
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Chart data fetch failed for "${input.symbol}": ${message}`,
      );
    }
  },
};

