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

