/**
 * Optimizer API routes: performance, prompt analysis, tool recommendations, personalization.
 */

import type { FastifyInstance } from "fastify";
import {
  getPerformanceTrends,
  analyzeAndSuggest,
  getToolRecommendations,
  getAllPreferences,
  savePreference,
} from "../optimizer/index.js";

export async function optimizerRoutes(app: FastifyInstance) {
  // GET /api/optimizer/performance?days=30 — performance trends
  app.get<{ Querystring: { days?: string } }>(
    "/api/optimizer/performance",
    async (request) => {
      const days = request.query.days ? Number(request.query.days) : 30;
      const trends = await getPerformanceTrends(days);
      return { trends };
    },
  );

  // POST /api/optimizer/analyze-prompt — trigger prompt analysis (uses DeepSeek)
  app.post("/api/optimizer/analyze-prompt", async () => {
    const suggestions = await analyzeAndSuggest();
    return { suggestions };
  });

  // GET /api/optimizer/tool-recommendations — tool rankings
  app.get("/api/optimizer/tool-recommendations", async () => {
    const recommendations = await getToolRecommendations();
    return { recommendations };
  });

  // GET /api/optimizer/personalization — current preferences
  app.get("/api/optimizer/personalization", async () => {
    const preferences = await getAllPreferences();
    return { preferences };
  });

  // POST /api/optimizer/personalization — save preferences
  app.post<{
    Body: {
      key?: string;
      value?: unknown;
      watchedStocks?: string[];
      preferredTools?: string[];
    };
  }>("/api/optimizer/personalization", async (request) => {
    const body = request.body as Record<string, unknown> | null;
    if (!body) {
      return { error: "Request body is required" };
    }

    // Support both { key, value } and { watchedStocks, preferredTools }
    if (body.key && body.value !== undefined) {
      await savePreference(body.key as string, body.value);
    }
    if (body.watchedStocks !== undefined) {
      await savePreference("watchedStocks", body.watchedStocks);
    }
    if (body.preferredTools !== undefined) {
      await savePreference("preferredTools", body.preferredTools);
    }

    const preferences = await getAllPreferences();
    return { preferences };
  });
}

