/**
 * Tool Recommender: scores and ranks tools based on usage data.
 */

import { db, schema } from "../db/index.js";
import { sql, count } from "drizzle-orm";
import type { ToolRecommendation } from "./types.js";

/**
 * Get tool recommendations based on usage statistics.
 * Score = weighted combination of frequency, success rate, and inverse latency.
 */
export async function getToolRecommendations(): Promise<ToolRecommendation[]> {
  const rows = await db
    .select({
      toolName: schema.toolExecutionLogs.toolName,
      frequency: count().as("frequency"),
      successCount: sql<number>`SUM(CASE WHEN ${schema.toolExecutionLogs.success} = 1 THEN 1 ELSE 0 END)`.as("success_count"),
      avgLatency: sql<number>`COALESCE(AVG(${schema.toolExecutionLogs.latencyMs}), 0)`.as("avg_latency"),
    })
    .from(schema.toolExecutionLogs)
    .groupBy(schema.toolExecutionLogs.toolName);

  if (rows.length === 0) {
    return [];
  }

  // Normalize values for scoring
  const maxFrequency = Math.max(...rows.map((r) => r.frequency));
  const maxLatency = Math.max(...rows.map((r) => r.avgLatency), 1);

  const recommendations: ToolRecommendation[] = rows.map((row) => {
    const successRate = row.frequency > 0 ? row.successCount / row.frequency : 0;
    const normalizedFrequency = maxFrequency > 0 ? row.frequency / maxFrequency : 0;
    const normalizedSpeed = 1 - row.avgLatency / maxLatency; // Higher is better (faster)

    // Weighted score: 30% frequency, 50% success rate, 20% speed
    const score =
      Math.round(
        (normalizedFrequency * 0.3 + successRate * 0.5 + normalizedSpeed * 0.2) * 1000,
      ) / 10;

    // Generate human-readable reason
    const reasons: string[] = [];
    if (successRate >= 0.9) reasons.push("high reliability");
    else if (successRate < 0.5) reasons.push("low reliability");
    if (normalizedFrequency >= 0.7) reasons.push("frequently used");
    if (row.avgLatency < 500) reasons.push("fast response");
    else if (row.avgLatency > 2000) reasons.push("slow response");

    const reason = reasons.length > 0 ? reasons.join(", ") : "moderate performance";

    return {
      toolName: row.toolName,
      score,
      frequency: row.frequency,
      successRate: Math.round(successRate * 1000) / 10,
      avgLatency: Math.round(row.avgLatency),
      reason,
    };
  });

  // Sort by score descending
  recommendations.sort((a, b) => b.score - a.score);

  return recommendations;
}

