CREATE TABLE `model_registry` (
	`key` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`display_name` text NOT NULL,
	`remote_created_at` integer DEFAULT 0 NOT NULL,
	`version_rank` integer DEFAULT 0 NOT NULL,
	`is_routable` integer DEFAULT false NOT NULL,
	`input_price_micros` integer DEFAULT 0 NOT NULL,
	`output_price_micros` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'official-seed' NOT NULL,
	`discovered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `owner_settings` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`model_preference` text DEFAULT 'latest' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `provider_sync` (
	`provider` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`current_model` text,
	`last_synced_at` text,
	`next_sync_at` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `usage_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`task_type` text NOT NULL,
	`input_units` integer DEFAULT 0 NOT NULL,
	`output_units` integer DEFAULT 0 NOT NULL,
	`provider_cost_micros` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`is_live` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
