/**
 * Stock Monitor Service
 * Periodically checks stock prices and triggers Autonomous Analysis on significant volatility.
 */

import { getNotificationService } from "../messaging/instance.js";
import { runCoordinatorStream } from "../agents/index.js";
import { quoteTool } from "../agent/tools/quote.js";

// Volatility threshold: 3%
const VOLATILITY_THRESHOLD = 0.03;
// Poll every 1 minute
const CHECK_INTERVAL_MS = 60 * 1000;

let lastPrices: Record<string, number> = {};
let monitorInterval: NodeJS.Timeout | null = null;

export function startStockMonitor(symbols: string[] = ["AAPL"]) {
  console.log(`[StockMonitor] Starting monitor for ${symbols.join(", ")}...`);

  monitorInterval = setInterval(async () => {
    for (const symbol of symbols) {
      try {
        const quote = await quoteTool.execute({ symbol });
        const currentPrice = quote.price;

        if (currentPrice === null) continue;

        const lastPrice = lastPrices[symbol];

        if (lastPrice === undefined) {
          lastPrices[symbol] = currentPrice;
          console.log(`[StockMonitor] Initial price for ${symbol} set to $${currentPrice}`);
          continue;
        }

        const change = (currentPrice - lastPrice) / lastPrice;
        const absChange = Math.abs(change);

        if (absChange >= VOLATILITY_THRESHOLD) {
          console.log(`[StockMonitor] 🚨 Volatility alert for ${symbol}! Change: ${(change * 100).toFixed(2)}%`);
          
          // Update lastPrice immediately to prevent re-triggering while analysis runs
          lastPrices[symbol] = currentPrice;

          // Trigger Autonomous Analysis asynchronously
          triggerAnalysis(symbol, change, currentPrice).catch((err) => {
            console.error(`[StockMonitor] Background analysis error for ${symbol}:`, err);
          });
        }
      } catch (err) {
        console.error(`[StockMonitor] Error checking price for ${symbol}:`, err);
      }
    }
  }, CHECK_INTERVAL_MS);
}

export function stopStockMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

async function triggerAnalysis(symbol: string, change: number, newPrice: number) {
  const direction = change > 0 ? "surged" : "dropped";
  const percentage = (Math.abs(change) * 100).toFixed(2);
  const query = `The stock ${symbol} just ${direction} by ${percentage}% to $${newPrice}. Please run a comprehensive autonomous analysis to explain why this might be happening and what the strategy should be.`;
  
  console.log(`[StockMonitor] Triggering multi-agent analysis for ${symbol}:\n"${query}"`);
  
  let finalReport = "No final report generated.";
  const agentSummaries: string[] = [];

  try {
    for await (const event of runCoordinatorStream(query, { stockSymbol: symbol })) {
      if (event.type === "agent_result" && event.data) {
        const data = event.data as any;
        console.log(`[StockMonitor] Agent ${data.role} finished.`);
        if (data.summary) {
          agentSummaries.push(`[${data.role}] ${data.summary}`);
        }
      } else if (event.type === "final_report" && event.data) {
        const data = event.data as any;
        if (data.summary) {
          finalReport = data.summary;
        }
        console.log(`[StockMonitor] Coordinator finished.`);
      } else if (event.type === "error" && event.data) {
        const data = event.data as any;
        console.error(`[StockMonitor] Agent stream error:`, data.message);
      }
    }

    const alertMessage = `🚨 *Stock Alert: ${symbol}*\n\n` +
      `Price ${direction} by ${percentage}% to $${newPrice}!\n\n` +
      `*Coordinator Report:*\n${finalReport}\n\n` +
      `*Agent Insights:*\n${agentSummaries.join("\\n\\n")}`;

    console.log(`[StockMonitor] Generated report:\n${alertMessage}`);

    const service = getNotificationService();
    const channels = service.listChannels();
    
    if (channels.length === 0) {
      console.log(`[StockMonitor] No notification channels configured. Logged to console only.`);
    } else {
      for (const channel of channels) {
        console.log(`[StockMonitor] Sending report to ${channel}...`);
        const result = await service.send(channel, { to: "default", body: alertMessage });
        if (!result.success) {
          console.error(`[StockMonitor] Failed to send to ${channel}:`, result.error);
        }
      }
    }
  } catch (err) {
    console.error(`[StockMonitor] Error during analysis for ${symbol}:`, err);
  }
}

