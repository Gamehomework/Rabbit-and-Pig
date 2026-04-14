/**
 * calc_indicator_series tool: Computes rolling technical indicator time-series
 * (SMA, EMA, Bollinger Bands) formatted for chart overlay via add_indicator_lines.
 */

import YahooFinance from "yahoo-finance2";
import type { Tool } from "./types.js";

const yf = new YahooFinance();

const INDICATOR_COLORS: Record<string, string> = {
  SMA20: "#2196f3",
  SMA50: "#ff9800",
  SMA200: "#9c27b0",
  EMA12: "#00bcd4",
  EMA26: "#009688",
  BB_UPPER: "#9e9e9e",
  BB_MIDDLE: "#607d8b",
  BB_LOWER: "#9e9e9e",
};

interface LinePoint {
  time: string;
  value: number;
}

interface ChartLineOutput {
  title: string;
  color: string;
  data: LinePoint[];
}

// ── Rolling helpers ─────────────────────────────────────────────────

function rollingSMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    result.push(sum / period);
  }
  return result;
}

function rollingEMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period) return result;
  // Seed with SMA of first `period` values
  let ema = 0;
  for (let i = 0; i < period; i++) ema += closes[i];
  ema /= period;
  result[period - 1] = ema;
  const k = 2 / (period + 1);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

function rollingBollinger(closes: number[], period = 20): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = rollingSMA(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const m = middle[i]!;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - m) ** 2;
    const std = Math.sqrt(variance / period);
    upper[i] = m + 2 * std;
    lower[i] = m - 2 * std;
  }
  return { upper, middle, lower };
}

// ── Tool definition ─────────────────────────────────────────────────

export interface CalcIndicatorSeriesInput {
  symbol: string;
  indicators: string[];
  range?: string;
}

export const calcIndicatorSeriesTool: Tool<CalcIndicatorSeriesInput, { lines: ChartLineOutput[] }> = {
  name: "calc_indicator_series",
  description:
    "Calculate technical indicator time-series for charting (SMA, EMA, Bollinger Bands). Returns data formatted for add_indicator_lines.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Stock ticker symbol (e.g. AAPL)." },
      indicators: {
        type: "array",
        items: { type: "string" },
        description: "Indicator names: SMA20, SMA50, SMA200, EMA12, EMA26, BB_UPPER, BB_MIDDLE, BB_LOWER.",
      },
      range: { type: "string", enum: ["3mo", "6mo", "1y", "2y"], description: "Time range. Default '6mo'." },
    },
    required: ["symbol", "indicators"],
  },

  async execute(input) {
    const symbol = input.symbol.toUpperCase().trim();
    const rangeDays: Record<string, number> = { "3mo": 90, "6mo": 180, "1y": 365, "2y": 730 };
    const days = rangeDays[input.range ?? "6mo"] ?? 180;
    // Fetch extra data for warm-up (SMA200 needs 200 extra points)
    const warmup = 250;
    const period1 = new Date();
    period1.setDate(period1.getDate() - days - warmup);

    const result = await yf.chart(symbol, { period1, interval: "1d" });
    const quotes = result.quotes.filter(q => q.close != null);
    const closes = quotes.map(q => q.close as number);
    const dates = quotes.map(q => q.date.toISOString().slice(0, 10));

    // Only return data within the requested range
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    const lines: ChartLineOutput[] = [];
    const bb = input.indicators.some(i => i.startsWith("BB_")) ? rollingBollinger(closes) : null;

    for (const ind of input.indicators) {
      let values: (number | null)[];
      const match = ind.match(/^(SMA|EMA)(\d+)$/);
      if (match) {
        const period = parseInt(match[2], 10);
        values = match[1] === "SMA" ? rollingSMA(closes, period) : rollingEMA(closes, period);
      } else if (ind === "BB_UPPER" && bb) { values = bb.upper; }
      else if (ind === "BB_MIDDLE" && bb) { values = bb.middle; }
      else if (ind === "BB_LOWER" && bb) { values = bb.lower; }
      else continue; // skip unsupported

      const data: LinePoint[] = [];
      for (let i = 0; i < values.length; i++) {
        if (values[i] != null && dates[i] >= cutoffStr) {
          data.push({ time: dates[i], value: Math.round(values[i]! * 100) / 100 });
        }
      }
      lines.push({ title: ind, color: INDICATOR_COLORS[ind] ?? "#757575", data });
    }

    return { lines };
  },
};

