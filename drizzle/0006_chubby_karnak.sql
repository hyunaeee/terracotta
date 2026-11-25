CREATE TABLE `local_agent_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`run_id` text,
	`command` text NOT NULL,
	`cwd` text DEFAULT '.' NOT NULL,
	`timeout_seconds` integer DEFAULT 30 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`stdout` text DEFAULT '' NOT NULL,
	`stderr` text DEFAULT '' NOT NULL,
	`exit_code` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`started_at` text,
	`completed_at` text
);
--> statement-breakpoint
CREATE TABLE `local_agents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`platform` text,
	`shell` text,
	`workspace` text,
	`last_seen_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_agents_token_hash_unique` ON `local_agents` (`token_hash`);