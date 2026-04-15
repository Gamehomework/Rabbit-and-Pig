/**
 * run_backtest tool: Backtest trading strategies against historical price data.
 * Strategies: ma_crossover, rsi, bollinger_breakout
 */

import YahooFinance from "yahoo-finance2";
import type { Tool } from "./types.js";

const yf = new YahooFinance();

// ── Types ────────────────────────────────────────────────────────────

export interface BacktestInput {
  symbol: string;
  strategy: "ma_crossover" | "rsi" | "bollinger_breakout";
  range?: "1y" | "2y" | "3y";
  initialCapital?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  overbought?: number;
  oversold?: number;
  bbPeriod?: number;
  bbStdDev?: number;
}

export interface Trade {
  date: string;
  action: "BUY" | "SELL";
  price: number;
  shares: number;
  pnl: number;
}

export interface BacktestStats {
  totalReturn: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  totalTrades: number;
}

export interface ChartMarker {
  time: string;
  position: "belowBar" | "aboveBar";
  color: string;
  shape: "arrowUp" | "arrowDown";
  text: string;
}

export interface BacktestOutput {
  trades: Trade[];
  stats: BacktestStats;
  markers: ChartMarker[];
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

// ── Indicator helpers ────────────────────────────────────────────────

function sma(data: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    out.push(sum / period);
  }
  return out;
}

function rsiCalc(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function bollinger(closes: number[], period = 20, stdDev = 2) {
  const mid = sma(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const m = mid[i]!;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - m) ** 2;
    const std = Math.sqrt(variance / period);
    upper[i] = m + stdDev * std;
    lower[i] = m - stdDev * std;
  }
  return { upper, middle: mid, lower };
}

// ── Strategy runners ─────────────────────────────────────────────────

function runMACrossover(
  closes: number[], dates: string[], fast: number, slow: number, capital: number,
): Trade[] {
  const fastMA = sma(closes, fast);
  const slowMA = sma(closes, slow);
  const trades: Trade[] = [];
  let position = 0, entryPrice = 0, cash = capital;

  for (let i = 1; i < closes.length; i++) {
    if (fastMA[i] == null || slowMA[i] == null || fastMA[i - 1] == null || slowMA[i - 1] == null) continue;
    const prevFast = fastMA[i - 1]!, prevSlow = slowMA[i - 1]!;
    const curFast = fastMA[i]!, curSlow = slowMA[i]!;
    const price = closes[i];
    if (prevFast <= prevSlow && curFast > curSlow && position === 0) {
      const shares = Math.floor(cash / price);
      if (shares <= 0) continue;
      position = shares; entryPrice = price; cash -= shares * price;
      trades.push({ date: dates[i], action: "BUY", price: round2(price), shares, pnl: 0 });
    } else if (prevFast >= prevSlow && curFast < curSlow && position > 0) {
      const pnl = (price - entryPrice) * position;
      cash += position * price;
      trades.push({ date: dates[i], action: "SELL", price: round2(price), shares: position, pnl: round2(pnl) });
      position = 0;
    }
  }
  return trades;
}

function runRSI(
  closes: number[], dates: string[], overbought: number, oversold: number, capital: number,
): Trade[] {
  const rsiValues = rsiCalc(closes, 14);
  const trades: Trade[] = [];
  let position = 0, entryPrice = 0, cash = capital;

  for (let i = 1; i < closes.length; i++) {
    if (rsiValues[i] == null || rsiValues[i - 1] == null) continue;
    const prev = rsiValues[i - 1]!, cur = rsiValues[i]!;
    const price = closes[i];
    if (prev <= oversold && cur > oversold && position === 0) {
      const shares = Math.floor(cash / price);
      if (shares <= 0) continue;
      position = shares; entryPrice = price; cash -= shares * price;
      trades.push({ date: dates[i], action: "BUY", price: round2(price), shares, pnl: 0 });
    } else if (prev >= overbought && cur < overbought && position > 0) {
      const pnl = (price - entryPrice) * position;
      cash += position * price;
      trades.push({ date: dates[i], action: "SELL", price: round2(price), shares: position, pnl: round2(pnl) });
      position = 0;
    }
  }
  return trades;
}

function runBollingerBreakout(
  closes: number[], dates: string[], period: number, stdDev: number, capital: number,
): Trade[] {
  const bb = bollinger(closes, period, stdDev);
  const trades: Trade[] = [];
  let position = 0, entryPrice = 0, cash = capital;

  for (let i = 1; i < closes.length; i++) {
    if (bb.lower[i] == null || bb.upper[i] == null) continue;
    const price = closes[i];
    if (price < bb.lower[i]! && position === 0) {
      const shares = Math.floor(cash / price);
      if (shares <= 0) continue;
      position = shares; entryPrice = price; cash -= shares * price;
      trades.push({ date: dates[i], action: "BUY", price: round2(price), shares, pnl: 0 });
    } else if (price > bb.upper[i]! && position > 0) {
      const pnl = (price - entryPrice) * position;
      cash += position * price;
      trades.push({ date: dates[i], action: "SELL", price: round2(price), shares: position, pnl: round2(pnl) });
      position = 0;
    }
  }
  return trades;
}

// ── Stats & markers ──────────────────────────────────────────────────

function calcStats(trades: Trade[], initialCapital: number): BacktestStats {
  const sells = trades.filter(t => t.action === "SELL");
  const totalPnl = sells.reduce((s, t) => s + t.pnl, 0);
  const wins = sells.filter(t => t.pnl > 0).length;
  let peak = initialCapital, maxDD = 0, equity = initialCapital;
  for (const t of trades) {
    if (t.action === "SELL") equity += t.pnl;
    if (equity > peak) peak = equity;
    if (peak > 0) {
      const dd = (peak - equity) / peak;
      if (dd > maxDD) maxDD = dd;
    }
  }
  const returns = sells.map(t => t.pnl / initialCapital);
  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 1
    ? returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1) : 0;
  const sharpe = Math.sqrt(variance) > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(252) : 0;
  return {
    totalReturn: round2((totalPnl / initialCapital) * 100),
    winRate: round2(sells.length ? (wins / sells.length) * 100 : 0),
    maxDrawdown: round2(maxDD * 100),
    sharpeRatio: round2(sharpe),
    totalTrades: trades.length,
  };
}

function tradesToMarkers(trades: Trade[]): ChartMarker[] {
  return trades.map(t => ({
    time: t.date.slice(0, 10),
    position: t.action === "BUY" ? "belowBar" as const : "aboveBar" as const,
    color: t.action === "BUY" ? "green" : "red",
    shape: t.action === "BUY" ? "arrowUp" as const : "arrowDown" as const,
    text: `${t.action} ${t.shares}@${t.price}`,
  }));
}

// ── Tool definition ──────────────────────────────────────────────────

export const backtestTool: Tool<BacktestInput, BacktestOutput> = {
  name: "run_backtest",
  description:
    "Run a backtest of a trading strategy on historical price data. " +
    "Strategies: ma_crossover (moving average crossover), rsi (RSI overbought/oversold), " +
    "bollinger_breakout (Bollinger Band mean reversion). " +
    "Returns trade list, performance stats, and chart markers. " +
    "After calling this, use show_backtest_result to display results on the UI.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Stock ticker symbol (e.g. AAPL)." },
      strategy: {
        type: "string",
        enum: ["ma_crossover", "rsi", "bollinger_breakout"],
        description: "Trading strategy to backtest.",
      },
      range: {
        type: "string",
        enum: ["1y", "2y", "3y"],
        description: "Historical data range. Default 1y.",
      },
      initialCapital: { type: "number", description: "Starting capital in USD. Default 10000." },
      fastPeriod: { type: "number", description: "Fast MA period for ma_crossover. Default 10." },
      slowPeriod: { type: "number", description: "Slow MA period for ma_crossover. Default 30." },
      overbought: { type: "number", description: "RSI overbought threshold. Default 70." },
      oversold: { type: "number", description: "RSI oversold threshold. Default 30." },
      bbPeriod: { type: "number", description: "Bollinger Band period. Default 20." },
      bbStdDev: { type: "number", description: "Bollinger Band std deviation multiplier. Default 2." },
    },
    required: ["symbol", "strategy"],
  },

  async execute(input: BacktestInput): Promise<BacktestOutput> {
    const symbol = input.symbol.toUpperCase().trim();
    const rangeDays: Record<string, number> = { "1y": 365, "2y": 730, "3y": 1095 };
    const days = rangeDays[input.range ?? "1y"] ?? 365;
    const capital = input.initialCapital ?? 10000;
    const warmup = 250;

    const period1 = new Date();
    period1.setDate(period1.getDate() - days - warmup);

    const result = await yf.chart(symbol, { period1, interval: "1d" });
    const quotes = result.quotes.filter(q => q.close != null);
    const closes = quotes.map(q => q.close as number);
    const dates = quotes.map(q => q.date.toISOString());

    let trades: Trade[];
    switch (input.strategy) {
      case "ma_crossover":
        trades = runMACrossover(closes, dates, input.fastPeriod ?? 10, input.slowPeriod ?? 30, capital);
        break;
      case "rsi":
        trades = runRSI(closes, dates, input.overbought ?? 70, input.oversold ?? 30, capital);
        break;
      case "bollinger_breakout":
        trades = runBollingerBreakout(closes, dates, input.bbPeriod ?? 20, input.bbStdDev ?? 2, capital);
        break;
    }

    return {
      trades,
      stats: calcStats(trades, capital),
      markers: tradesToMarkers(trades),
    };
  },
};