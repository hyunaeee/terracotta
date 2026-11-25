CREATE TABLE `context_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`from_provider` text NOT NULL,
	`to_provider` text NOT NULL,
	`packet_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `context_run_links` (
	`run_id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`goal` text DEFAULT '' NOT NULL,
	`last_provider` text,
	`last_model_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`role` text NOT NULL,
	`provider` text,
	`model_id` text,
	`content` text NOT NULL,
	`trace_json` text DEFAULT '[]' NOT NULL,
	`run_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
