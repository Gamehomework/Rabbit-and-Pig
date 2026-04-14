CREATE TABLE `plugins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`version` text NOT NULL,
	`source` text NOT NULL,
	`source_uri` text NOT NULL,
	`status` text DEFAULT 'installed' NOT NULL,
	`config` text,
	`installed_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugins_name_unique` ON `plugins` (`name`);--> statement-breakpoint
CREATE TABLE `tool_whitelist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tool_name` text NOT NULL,
	`allowed` integer DEFAULT true NOT NULL,
	`added_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tool_whitelist_tool_name_unique` ON `tool_whitelist` (`tool_name`);