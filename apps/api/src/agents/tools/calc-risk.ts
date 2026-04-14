/**
 * calc_risk tool: Computes risk metrics from historical price data.
 * Sharpe ratio, max drawdown, VaR (95%), volatility, beta vs S&P 500.
 */

import YahooFinance from "yahoo-finance2";
import type { Tool } from "../../agent/tools/types.js";

const yf = new YahooFinance();

export interface CalcRiskInput {
  symbol: string;
  range?: string; // default "1y"
}

export interface RiskOutput {
  symbol: string;
  period: string;
  dataPoints: number;
  annualizedReturn: number | null;
  annualizedVolatility: number | null;
  sharpeRatio: number | null;
  maxDrawdown: number | null;
  maxDrawdownPeriod: { start: string; end: string } | null;
  var95: number | null; // 95% Value at Risk (daily)
  var99: number | null;
  beta: number | null; // vs S&P 500
  dailyReturns: { mean: number; stdDev: number; min: number; max: number };
}

function calcDailyReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / arr.length);
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[idx];
}

export const calcRiskTool: Tool<CalcRiskInput, RiskOutput> = {
  name: "calc_risk",
  description:
    "Compute risk metrics for a stock: annualized return, volatility, Sharpe ratio, max drawdown, Value-at-Risk (95% and 99%), and beta vs S&P 500.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Stock ticker symbol (e.g. AAPL)." },
      range: { type: "string", description: "Time range: '6mo', '1y', '2y'. Default '1y'.", enum: ["6mo", "1y", "2y"] },
    },
    required: ["symbol"],
  },

  async execute(input: CalcRiskInput): Promise<RiskOutput> {
    const symbol = input.symbol.toUpperCase().trim();
    const rangeDays: Record<string, number> = { "6mo": 180, "1y": 365, "2y": 730 };
    const days = rangeDays[input.range ?? "1y"] ?? 365;
    const period1 = new Date();
    period1.setDate(period1.getDate() - days);

    try {
      // Fetch stock and S&P 500 data in parallel
      const [stockData, spyData] = await Promise.all([
        yf.chart(symbol, { period1, interval: "1d" }),
        yf.chart("^GSPC", { period1, interval: "1d" }),
      ]);

      const closes = stockData.quotes.map(q => q.close).filter((c): c is number => c != null);
      const spyCloses = spyData.quotes.map(q => q.close).filter((c): c is number => c != null);

      if (closes.length < 10) throw new Error("Not enough data points");

      const returns = calcDailyReturns(closes);
      const spyReturns = calcDailyReturns(spyCloses);

      // Annualized return
      const totalReturn = (closes[closes.length - 1] - closes[0]) / closes[0];
      const annualizedReturn = (1 + totalReturn) ** (252 / closes.length) - 1;

      // Volatility
      const dailyVol = stdDev(returns);
      const annualizedVol = dailyVol * Math.sqrt(252);

      // Sharpe ratio (assuming risk-free rate of 4%)
      const riskFreeRate = 0.04;
      const sharpe = annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / annualizedVol : null;

      // Max drawdown
      let maxDD = 0;
      let peak = closes[0];
      let ddStart = 0, ddEnd = 0, peakIdx = 0;
      for (let i = 1; i < closes.length; i++) {
        if (closes[i] > peak) { peak = closes[i]; peakIdx = i; }
        const dd = (peak - closes[i]) / peak;
        if (dd > maxDD) { maxDD = dd; ddStart = peakIdx; ddEnd = i; }
      }
      const dates = stockData.quotes.map(q => q.date.toISOString().split("T")[0]);

      // Beta
      let beta: number | null = null;
      const minLen = Math.min(returns.length, spyReturns.length);
      if (minLen > 10) {
        const stockR = returns.slice(-minLen);
        const mktR = spyReturns.slice(-minLen);
        const mktMean = mean(mktR);
        const stockMean = mean(stockR);
        let covariance = 0, mktVariance = 0;
        for (let i = 0; i < minLen; i++) {
          covariance += (stockR[i] - stockMean) * (mktR[i] - mktMean);
          mktVariance += (mktR[i] - mktMean) ** 2;
        }
        beta = mktVariance > 0 ? covariance / mktVariance : null;
      }

      return {
        symbol, period: input.range ?? "1y", dataPoints: closes.length,
        annualizedReturn, annualizedVolatility: annualizedVol,
        sharpeRatio: sharpe, maxDrawdown: -maxDD,
        maxDrawdownPeriod: dates[ddStart] && dates[ddEnd] ? { start: dates[ddStart], end: dates[ddEnd] } : null,
        var95: percentile(returns, 0.05), var99: percentile(returns, 0.01),
        beta,
        dailyReturns: { mean: mean(returns), stdDev: dailyVol, min: Math.min(...returns), max: Math.max(...returns) },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Risk calculation failed for "${symbol}": ${message}`);
    }
  },
};

