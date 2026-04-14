/** Performance metric aggregated by day */
export interface PerformanceMetric {
  date: string;
  avgLatencyMs: number;
  avgIterations: number;
  successRate: number;
  queryCount: number;
}

/** A suggestion for improving agent prompts */
export interface PromptSuggestion {
  area: string;
  current: string;
  suggested: string;
  reasoning: string;
}

/** A tool usage recommendation with scoring */
export interface ToolRecommendation {
  toolName: string;
  score: number;
  frequency: number;
  successRate: number;
  avgLatency: number;
  reason: string;
}

/** User preferences for personalization */
export interface UserPreferences {
  watchedStocks: string[];
  preferredTools: string[];
  commonQueryTypes: string[];
}

