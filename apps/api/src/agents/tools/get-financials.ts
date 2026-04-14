/**
 * get_financials tool: Fetches financial data (income statement, key metrics)
 * for a stock symbol using Yahoo Finance.
 */

import YahooFinance from "yahoo-finance2";
import type { Tool } from "../../agent/tools/types.js";

const yf = new YahooFinance();

export interface GetFinancialsInput {
  symbol: string;
}

export interface FinancialsOutput {
  symbol: string;
  name: string;
  sector: string | null;
  industry: string | null;
  // Valuation metrics
  peRatio: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  enterpriseValue: number | null;
  // Profitability
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  // Growth
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  // Financial health
  totalRevenue: number | null;
  netIncome: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  // Per share
  eps: number | null;
  bookValue: number | null;
  // Dividends
  dividendYield: number | null;
  payoutRatio: number | null;
  // Market
  marketCap: number | null;
  beta: number | null;
}

export const getFinancialsTool: Tool<GetFinancialsInput, FinancialsOutput> = {
  name: "get_financials",
  description:
    "Fetch comprehensive financial data for a stock: valuation ratios (P/E, PEG, P/B), profitability margins, growth rates, balance sheet health, and per-share metrics. Use for fundamental analysis.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "Stock ticker symbol (e.g. AAPL, MSFT, TSLA).",
      },
    },
    required: ["symbol"],
  },

  async execute(input: GetFinancialsInput): Promise<FinancialsOutput> {
    const symbol = input.symbol.toUpperCase().trim();

    try {
      // quoteSummary gives us key financial data in one call
      const result = await yf.quoteSummary(symbol, {
        modules: ["defaultKeyStatistics", "financialData", "summaryProfile", "summaryDetail", "price"],
      }) as Record<string, any>;

      const ks = result.defaultKeyStatistics ?? {};
      const fd = result.financialData ?? {};
      const sp = result.summaryProfile ?? {};
      const sd = result.summaryDetail ?? {};
      const pr = result.price ?? {};

      return {
        symbol,
        name: pr.shortName ?? pr.longName ?? symbol,
        sector: sp.sector ?? null,
        industry: sp.industry ?? null,
        // Valuation
        peRatio: sd.trailingPE ?? ks.trailingPE ?? null,
        forwardPE: ks.forwardPE ?? sd.forwardPE ?? null,
        pegRatio: ks.pegRatio ?? null,
        priceToBook: ks.priceToBook ?? null,
        priceToSales: ks.priceToSalesTrailing12Months ?? null,
        enterpriseValue: ks.enterpriseValue ?? null,
        // Profitability
        grossMargin: fd.grossMargins ?? null,
        operatingMargin: fd.operatingMargins ?? null,
        netMargin: fd.profitMargins ?? null,
        returnOnEquity: fd.returnOnEquity ?? null,
        returnOnAssets: fd.returnOnAssets ?? null,
        // Growth
        revenueGrowth: fd.revenueGrowth ?? null,
        earningsGrowth: fd.earningsGrowth ?? null,
        // Financial health
        totalRevenue: fd.totalRevenue ?? null,
        netIncome: ks.netIncomeToCommon ?? null,
        totalDebt: fd.totalDebt ?? null,
        totalCash: fd.totalCash ?? null,
        debtToEquity: fd.debtToEquity ?? null,
        currentRatio: fd.currentRatio ?? null,
        // Per share
        eps: ks.trailingEps ?? null,
        bookValue: ks.bookValue ?? null,
        // Dividends
        dividendYield: sd.dividendYield ?? null,
        payoutRatio: sd.payoutRatio ?? null,
        // Market
        marketCap: pr.marketCap ?? sd.marketCap ?? null,
        beta: ks.beta ?? null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Financial data fetch failed for "${symbol}": ${message}`);
    }
  },
};

