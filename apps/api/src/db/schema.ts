import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// --- Core tables ---

export const stocks = sqliteTable("stocks", {
  symbol: text("symbol").primaryKey(),
  name: text("name").notNull(),
  sector: text("sector"),
  marketCap: real("market_cap"),
  peRatio: real("pe_ratio"),
  dividendYield: real("dividend_yield"),
  weekHigh52: real("week_high_52"),
  weekLow52: real("week_low_52"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
});

export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  stockSymbol: text("stock_symbol").references(() => stocks.symbol),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
});

// --- Agent tables ---

export const agentSessions = sqliteTable("agent_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  status: text("status").notNull().default("active"),
});

export const agentMessages = sqliteTable(
  "agent_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => agentSessions.id),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => [
    index("agent_messages_session_id_idx").on(table.sessionId),
    index("agent_messages_created_at_idx").on(table.createdAt),
  ],
);

// --- Plugin tables ---

export const plugins = sqliteTable("plugins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  version: text("version").notNull(),
  source: text("source").notNull(), // "npm" | "remote" | "local"
  sourceUri: text("source_uri").notNull(),
  status: text("status").notNull().default("installed"), // "installed" | "enabled" | "disabled" | "error"
  config: text("config"), // JSON text
  installedAt: text("installed_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
});

export const toolWhitelist = sqliteTable("tool_whitelist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  toolName: text("tool_name").notNull().unique(),
  allowed: integer("allowed", { mode: "boolean" }).notNull().default(true),
  addedAt: text("added_at").default(sql`(datetime('now'))`).notNull(),
});

// --- Messaging tables ---

export const notificationChannels = sqliteTable("notification_channels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelType: text("channel_type").notNull(),
  config: text("config").notNull(), // JSON text
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
});

export const notificationHistory = sqliteTable(
  "notification_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    channelType: text("channel_type").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject"),
    message: text("message").notNull(),
    status: text("status").notNull(), // "sent" | "failed" | "rate_limited"
    error: text("error"),
    sentAt: text("sent_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => [
    index("notification_history_channel_type_idx").on(table.channelType),
    index("notification_history_sent_at_idx").on(table.sentAt),
  ],
);

// --- Logging tables ---

export const queryLogs = sqliteTable(
  "query_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => agentSessions.id),
    queryText: text("query_text").notNull(),
    timestamp: text("timestamp").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => [
    index("query_logs_session_id_idx").on(table.sessionId),
    index("query_logs_timestamp_idx").on(table.timestamp),
  ],
);

export const toolExecutionLogs = sqliteTable(
  "tool_execution_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => agentSessions.id),
    toolName: text("tool_name").notNull(),
    input: text("input").notNull(),
    output: text("output").notNull(),
    latencyMs: integer("latency_ms"),
    success: integer("success", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => [
    index("tool_exec_logs_session_id_idx").on(table.sessionId),
    index("tool_exec_logs_created_at_idx").on(table.createdAt),
  ],
);

export const agentDecisionLogs = sqliteTable(
  "agent_decision_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => agentSessions.id),
    stepNumber: integer("step_number").notNull(),
    thought: text("thought"),
    action: text("action"),
    toolName: text("tool_name"),
    result: text("result"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => [
    index("agent_decision_logs_session_id_idx").on(table.sessionId),
    index("agent_decision_logs_created_at_idx").on(table.createdAt),
  ],
);

// --- Optimizer tables ---

export const userPreferences = sqliteTable("user_preferences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
});

