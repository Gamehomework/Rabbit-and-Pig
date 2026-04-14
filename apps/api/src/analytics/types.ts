/**
 * Analytics engine types
 */

export interface DateRange {
  from: Date;
  to: Date;
}

export interface OverviewStats {
  totalQueries: number;
  avgLatencyMs: number;
  successRate: number;
  activeSessions: number;
  totalNotifications: number;
}

export interface QueryVolume {
  timestamp: string;
  count: number;
}

export interface ToolUsage {
  toolName: string;
  count: number;
  avgLatencyMs: number;
  successRate: number;
}

export interface SessionSummary {
  id: number;
  createdAt: string;
  status: string;
  queryCount: number;
  toolCalls: number;
  avgLatency: number;
}

export interface SessionTrace {
  session: { id: number; createdAt: string; status: string };
  queries: Array<{ id: number; queryText: string; timestamp: string }>;
  decisions: Array<{
    id: number;
    stepNumber: number;
    thought: string | null;
    action: string | null;
    toolName: string | null;
    result: string | null;
    createdAt: string;
  }>;
  toolExecutions: Array<{
    id: number;
    toolName: string;
    input: string;
    output: string;
    latencyMs: number | null;
    success: boolean;
    createdAt: string;
  }>;
}

export interface NotificationStats {
  channel: string;
  sent: number;
  failed: number;
  rateLimited: number;
}

export interface NotesAnalytics {
  totalNotes: number;
  notesByStock: { stockSymbol: string; count: number }[];
  notesTrend: { timestamp: string; count: number }[];
  topNotedStocks: string[];
  notedButNeverQueried: string[];
}

