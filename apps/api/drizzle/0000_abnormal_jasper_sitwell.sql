CREATE TABLE `agent_decision_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`step_number` integer NOT NULL,
	`thought` text,
	`action` text,
	`tool_name` text,
	`result` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `agent_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_decision_logs_session_id_idx` ON `agent_decision_logs` (`session_id`);--> statement-breakpoint
CREATE INDEX `agent_decision_logs_created_at_idx` ON `agent_decision_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `agent_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `agent_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_messages_session_id_idx` ON `agent_messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `agent_messages_created_at_idx` ON `agent_messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `agent_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`status` text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`stock_symbol` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`stock_symbol`) REFERENCES `stocks`(`symbol`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `query_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`query_text` text NOT NULL,
	`timestamp` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `agent_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `query_logs_session_id_idx` ON `query_logs` (`session_id`);--> statement-breakpoint
CREATE INDEX `query_logs_timestamp_idx` ON `query_logs` (`timestamp`);--> statement-breakpoint
CREATE TABLE `stocks` (
	`symbol` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sector` text,
	`market_cap` real,
	`pe_ratio` real,
	`dividend_yield` real,
	`week_high_52` real,
	`week_low_52` real,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tool_execution_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`tool_name` text NOT NULL,
	`input` text NOT NULL,
	`output` text NOT NULL,
	`latency_ms` integer,
	`success` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `agent_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tool_exec_logs_session_id_idx` ON `tool_execution_logs` (`session_id`);--> statement-breakpoint
CREATE INDEX `tool_exec_logs_created_at_idx` ON `tool_execution_logs` (`created_at`);