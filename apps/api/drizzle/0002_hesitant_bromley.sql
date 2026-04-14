CREATE TABLE `notification_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_type` text NOT NULL,
	`config` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_type` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text,
	`message` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`sent_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_history_channel_type_idx` ON `notification_history` (`channel_type`);--> statement-breakpoint
CREATE INDEX `notification_history_sent_at_idx` ON `notification_history` (`sent_at`);