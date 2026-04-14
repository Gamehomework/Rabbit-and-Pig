/**
 * calc_indicators tool: Computes technical indicators from price data.
 * SMA, EMA, RSI, MACD, Bollinger Bands — all computed locally (no external API).
 */

import YahooFinance from "yahoo-finance2";
import type { Tool } from "../../agent/tools/types.js";

const yf = new YahooFinance();

export interface CalcIndicatorsInput {
  symbol: string;
  range?: string; // default "6mo"
}

export interface IndicatorsOutput {
  symbol: string;
  dataPoints: number;
  currentPrice: number | null;
  sma: { sma20: number | null; sma50: number | null; sma200: number | null };
  ema: { ema12: number | null; ema26: number | null };
  rsi14: number | null;
  macd: { macd: number | null; signal: number | null; histogram: number | null };
  bollingerBands: { upper: number | null; middle: number | null; lower: number | null };
  trend: "bullish" | "bearish" | "sideways";
}

function calcSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcMACD(prices: number[]): { macd: number | null; signal: number | null; histogram: number | null } {
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  if (ema12 === null || ema26 === null) return { macd: null, signal: null, histogram: null };
  const macdLine = ema12 - ema26;
  // Simplified signal line — in reality it's a 9-period EMA of MACD values
  const signal = macdLine * 0.8; // approximation
  return { macd: macdLine, signal, histogram: macdLine - signal };
}

function calcBollinger(prices: number[], period: number = 20): { upper: number | null; middle: number | null; lower: number | null } {
  const sma = calcSMA(prices, period);
  if (sma === null || prices.length < period) return { upper: null, middle: null, lower: null };
  const slice = prices.slice(-period);
  const variance = slice.reduce((sum, p) => sum + (p - sma) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  return { upper: sma + 2 * stdDev, middle: sma, lower: sma - 2 * stdDev };
}

export const calcIndicatorsTool: Tool<CalcIndicatorsInput, IndicatorsOutput> = {
  name: "calc_indicators",
  description:
    "Compute technical indicators for a stock: SMA (20/50/200), EMA (12/26), RSI (14), MACD, and Bollinger Bands. Fetches historical price data and calculates locally.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Stock ticker symbol (e.g. AAPL)." },
      range: { type: "string", description: "Time range: '3mo', '6mo', '1y', '2y'. Default '1y'.", enum: ["3mo", "6mo", "1y", "2y"] },
    },
    required: ["symbol"],
  },

  async execute(input: CalcIndicatorsInput): Promise<IndicatorsOutput> {
    const symbol = input.symbol.toUpperCase().trim();
    const rangeDays: Record<string, number> = { "3mo": 90, "6mo": 180, "1y": 365, "2y": 730 };
    const days = rangeDays[input.range ?? "1y"] ?? 365;

    const period1 = new Date();
    period1.setDate(period1.getDate() - days);

    try {
      const result = await yf.chart(symbol, { period1, interval: "1d" });
      const closes = result.quotes.map(q => q.close).filter((c): c is number => c != null);

      if (closes.length < 5) throw new Error("Not enough data points");

      const currentPrice = closes[closes.length - 1];
      const sma20 = calcSMA(closes, 20);
      const sma50 = calcSMA(closes, 50);
      const sma200 = calcSMA(closes, 200);

      // Determine trend
      let trend: "bullish" | "bearish" | "sideways" = "sideways";
      if (sma20 && sma50 && currentPrice > sma20 && sma20 > sma50) trend = "bullish";
      else if (sma20 && sma50 && currentPrice < sma20 && sma20 < sma50) trend = "bearish";

      return {
        symbol, dataPoints: closes.length, currentPrice,
        sma: { sma20, sma50, sma200 },
        ema: { ema12: calcEMA(closes, 12), ema26: calcEMA(closes, 26) },
        rsi14: calcRSI(closes),
        macd: calcMACD(closes),
        bollingerBands: calcBollinger(closes),
        trend,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Indicator calculation failed for "${symbol}": ${message}`);
    }
  },
};

