/**
 * AI Optimization Layer — barrel exports.
 */

export type {
  PerformanceMetric,
  PromptSuggestion,
  ToolRecommendation,
  UserPreferences,
} from "./types.js";

export { getPerformanceTrends, getSessionPerformance } from "./performance-tracker.js";
export { analyzeAndSuggest } from "./prompt-optimizer.js";
export { getToolRecommendations } from "./tool-recommender.js";
export {
  savePreference,
  getPreference,
  getAllPreferences,
  trackQueryPattern,
  getPersonalizationContext,
} from "./user-personalizer.js";

