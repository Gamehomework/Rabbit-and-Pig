/**
 * API client for Stock Research Agent backend.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// --- Types ---

export interface Stock {
  symbol: string;
  name: string;
  sector: string | null;
  marketCap: number | null;
  peRatio: number | null;
  dividendYield: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
  price: number | null;
}

export interface StockScreenParams {
  sector?: string;
  minMarketCap?: number;
  maxMarketCap?: number;
  limit?: number;
}

export interface OHLCVData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary?: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  stockSymbol: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentResponse {
  sessionId: string;
  answer: string;
  steps: Array<{
    iteration: number;
    thought: string | null;
    toolCall: { name: string; input: unknown } | null;
    toolResult: unknown;
  }>;
}

export interface LogEntry {
  id: number;
  sessionId: number;
  stepNumber: number;
  thought: string | null;
  action: string | null;
  toolName: string | null;
  timestamp: string;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  marketCap: number | null;
  peRatio: number | null;
  high52w: number | null;
  low52w: number | null;
  volume: number | null;
  currency: string | null;
}

// --- API Functions ---

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export async function searchStocks(q: string): Promise<SearchResult[]> {
  return fetchApi<SearchResult[]>(`/api/stocks/search?q=${encodeURIComponent(q)}`);
}

export async function screenStocks(params: StockScreenParams = {}): Promise<Stock[]> {
  const query = new URLSearchParams();
  if (params.sector) query.set("sector", params.sector);
  if (params.minMarketCap != null) query.set("minMarketCap", String(params.minMarketCap));
  if (params.maxMarketCap != null) query.set("maxMarketCap", String(params.maxMarketCap));
  if (params.limit != null) query.set("limit", String(params.limit));
  const qs = query.toString();
  return fetchApi<Stock[]>(`/api/stocks/screen${qs ? `?${qs}` : ""}`);
}

export async function getStockQuote(symbol: string): Promise<StockQuote> {
  return fetchApi<StockQuote>(`/api/stocks/${encodeURIComponent(symbol)}/quote`);
}

export async function getStockChart(symbol: string, range = "1mo"): Promise<OHLCVData[]> {
  return fetchApi<OHLCVData[]>(`/api/stocks/${encodeURIComponent(symbol)}/chart?range=${range}`);
}

export async function getStockNews(symbol: string, limit = 10): Promise<NewsItem[]> {
  return fetchApi<NewsItem[]>(`/api/stocks/${encodeURIComponent(symbol)}/news?limit=${limit}`);
}

export async function queryAgent(query: string, stockSymbol?: string): Promise<AgentResponse> {
  return fetchApi<AgentResponse>("/api/agent/query", {
    method: "POST",
    body: JSON.stringify({ query, ...(stockSymbol ? { stockSymbol } : {}) }),
  });
}

// --- Notes CRUD ---

export async function getNotes(stockSymbol?: string): Promise<Note[]> {
  const qs = stockSymbol ? `?stockSymbol=${encodeURIComponent(stockSymbol)}` : "";
  return fetchApi<Note[]>(`/api/notes${qs}`);
}

export async function createNote(data: { title: string; content: string; stockSymbol?: string }): Promise<Note> {
  return fetchApi<Note>("/api/notes", { method: "POST", body: JSON.stringify(data) });
}

export async function updateNote(id: number, data: { title?: string; content?: string }): Promise<Note> {
  return fetchApi<Note>(`/api/notes/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteNote(id: number): Promise<void> {
  await fetchApi<unknown>(`/api/notes/${id}`, { method: "DELETE" });
}

export async function getLogs(): Promise<LogEntry[]> {
  return fetchApi<LogEntry[]>("/api/logs");
}

// --- Notification Types & API ---

export interface NotificationChannel {
  channelType: string;
  config: Record<string, string>;
  isDefault?: boolean;
}

export interface NotificationHistoryItem {
  id: number;
  channel: string;
  recipient: string;
  message: string;
  status: "sent" | "failed" | "rate_limited";
  timestamp: string;
}

export async function getNotificationChannels(): Promise<NotificationChannel[]> {
  return fetchApi<NotificationChannel[]>("/api/notifications/channels");
}

export async function saveNotificationChannel(channel: NotificationChannel): Promise<NotificationChannel> {
  return fetchApi<NotificationChannel>("/api/notifications/channels", {
    method: "POST",
    body: JSON.stringify(channel),
  });
}

export async function sendNotification(data: { channel: string; message: string; recipient: string }): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>("/api/notifications/send", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getNotificationHistory(limit = 50): Promise<NotificationHistoryItem[]> {
  return fetchApi<NotificationHistoryItem[]>(`/api/notifications/history?limit=${limit}`);
}

// --- Plugin Types & API ---

export interface Plugin {
  name: string;
  description?: string;
  version?: string;
  status: "enabled" | "disabled" | "installed" | "error";
  source?: string;
  sourceUri?: string;
}

export async function getPlugins(): Promise<Plugin[]> {
  return fetchApi<Plugin[]>("/api/plugins");
}

export async function installPlugin(data: { name: string; source?: string; sourceUri?: string }): Promise<Plugin> {
  return fetchApi<Plugin>("/api/plugins/install", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function enablePlugin(name: string): Promise<Plugin> {
  return fetchApi<Plugin>(`/api/plugins/${encodeURIComponent(name)}/enable`, { method: "POST" });
}

export async function disablePlugin(name: string): Promise<Plugin> {
  return fetchApi<Plugin>(`/api/plugins/${encodeURIComponent(name)}/disable`, { method: "POST" });
}

export async function uninstallPlugin(name: string): Promise<void> {
  await fetchApi<unknown>(`/api/plugins/${encodeURIComponent(name)}`, { method: "DELETE" });
}

// --- Optimizer Types & API ---

export interface PerformanceMetric {
  date: string;
  avgLatencyMs: number;
  avgIterations: number;
  successRate: number;
  queryCount: number;
}

export interface PromptSuggestion {
  area: string;
  current: string;
  suggested: string;
  reasoning: string;
}

export interface ToolRecommendation {
  toolName: string;
  score: number;
  frequency: number;
  successRate: number;
  avgLatency: number;
  reason: string;
}

export interface UserPreferences {
  watchedStocks: string[];
  preferredTools: string[];
  commonQueryTypes: string[];
  [key: string]: unknown;
}

export async function getPerformanceTrends(days = 30): Promise<PerformanceMetric[]> {
  const res = await fetchApi<{ trends: PerformanceMetric[] }>(`/api/optimizer/performance?days=${days}`);
  return res.trends;
}

export async function analyzePrompt(): Promise<PromptSuggestion[]> {
  const res = await fetchApi<{ suggestions: PromptSuggestion[] }>("/api/optimizer/analyze-prompt", { method: "POST" });
  return res.suggestions;
}

export async function getToolRecommendations(): Promise<ToolRecommendation[]> {
  const res = await fetchApi<{ recommendations: ToolRecommendation[] }>("/api/optimizer/tool-recommendations");
  return res.recommendations;
}

export async function getPersonalization(): Promise<UserPreferences> {
  const res = await fetchApi<{ preferences: UserPreferences }>("/api/optimizer/personalization");
  return res.preferences;
}

export async function savePersonalization(data: { key?: string; value?: unknown; watchedStocks?: string[]; preferredTools?: string[] }): Promise<UserPreferences> {
  const res = await fetchApi<{ preferences: UserPreferences }>("/api/optimizer/personalization", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.preferences;
}

// --- Analytics Types & API ---

export interface AnalyticsOverview {
  totalQueries: number;
  avgLatencyMs: number;
  successRate: number;
  activeSessions: number;
  totalNotifications: number;
}

export interface QueryDataPoint {
  timestamp: string;
  count: number;
}

export interface ToolStats {
  toolName: string;
  count: number;
  avgLatencyMs: number;
  successRate: number;
}

export interface SessionSummary {
  id: string;
  createdAt: string;
  status: string;
  queryCount: number;
  toolCalls: number;
  avgLatency: number;
}

export interface SessionDetail {
  session: SessionSummary;
  queries: unknown[];
  decisions: unknown[];
  toolExecutions: unknown[];
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

export async function getNotesAnalytics(from?: string, to?: string): Promise<NotesAnalytics> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return fetchApi<NotesAnalytics>(`/api/analytics/notes${qs ? `?${qs}` : ""}`);
}

export async function getAnalyticsOverview(from: string, to: string): Promise<AnalyticsOverview> {
  return fetchApi<AnalyticsOverview>(`/api/analytics/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

export async function getAnalyticsQueries(period: string, from: string, to: string): Promise<QueryDataPoint[]> {
  return fetchApi<QueryDataPoint[]>(`/api/analytics/queries?period=${encodeURIComponent(period)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

export async function getAnalyticsTools(from: string, to: string): Promise<ToolStats[]> {
  return fetchApi<ToolStats[]>(`/api/analytics/tools?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

export async function getAnalyticsSessions(limit = 20, offset = 0): Promise<SessionSummary[]> {
  return fetchApi<SessionSummary[]>(`/api/analytics/sessions?limit=${limit}&offset=${offset}`);
}

export async function getAnalyticsSessionDetail(id: string): Promise<SessionDetail> {
  return fetchApi<SessionDetail>(`/api/analytics/sessions/${encodeURIComponent(id)}`);
}

export async function getAnalyticsNotifications(from: string, to: string): Promise<NotificationStats[]> {
  return fetchApi<NotificationStats[]>(`/api/analytics/notifications?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

export function getAnalyticsExportUrl(format: "csv" | "json", type: "queries" | "tools" | "sessions", from: string, to: string): string {
  return `${BASE_URL}/api/analytics/export?format=${format}&type=${type}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

// --- Agent Streaming ---

export interface AgentStreamEvent {
  type: "step" | "answer" | "error" | "done" | "agent_start" | "agent_result";
  thought?: string | null;
  toolName?: string | null;
  toolInput?: unknown;
  toolResult?: unknown;
  iteration?: number;
  answer?: string;
  error?: string;
  // Agent OS fields (agent_start / agent_result events)
  role?: string;
  displayName?: string;
  agentSummary?: string;
  agentSuccess?: boolean;
  agentConfidence?: number;
  agentLatencyMs?: number;
}

// --- Multi-Agent Streaming ---

export interface MultiAgentEvent {
  type: "session" | "coordinator_thought" | "agent_start" | "agent_result" | "agent_step" | "agent_tool_result" | "final_report" | "error";
  sessionId?: number;
  role?: string;
  displayName?: string;
  query?: string;
  iteration?: number;
  thought?: string;
  summary?: string;
  data?: Record<string, unknown>;
  confidence?: number;
  success?: boolean;
  agentOutputs?: unknown[];
  totalLatencyMs?: number;
  message?: string;
  error?: string;
  toolName?: string;
  toolInput?: unknown;
  output?: unknown;
  sources?: string[];
  steps?: unknown[];
  latencyMs?: number;
}

/**
 * Stream agent analysis via SSE (POST /api/agent/stream).
 * Calls `onEvent` for each parsed SSE event.
 * Returns an AbortController so the caller can cancel.
 */
export function streamAgentAnalysis(
  query: string,
  stockSymbol: string,
  onEvent: (event: AgentStreamEvent) => void,
  onError?: (err: Error) => void,
  onDone?: () => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/agent/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, stockSymbol }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`API error ${res.status}: ${body}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              onDone?.();
              return;
            }
            try {
              const event = JSON.parse(data) as AgentStreamEvent;
              onEvent(event);
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
      onDone?.();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return controller;
}



/**
 * Stream multi-agent analysis via SSE (POST /api/agent/multi-stream).
 * Returns an AbortController so the caller can cancel.
 */
export function streamMultiAgentAnalysis(
  query: string,
  options: { stockSymbol?: string; urls?: string[] },
  onEvent: (event: MultiAgentEvent) => void,
  onError?: (err: Error) => void,
  onDone?: () => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/agent/multi-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, ...options }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`API error ${res.status}: ${body}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              onDone?.();
              return;
            }
            try {
              const event = JSON.parse(data) as MultiAgentEvent;
              onEvent(event);
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
      onDone?.();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return controller;
}
