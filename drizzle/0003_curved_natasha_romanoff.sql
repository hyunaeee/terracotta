CREATE TABLE `orchestration_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`event_type` text NOT NULL,
	`provider` text,
	`model_id` text,
	`connection_id` text,
	`tool_name` text,
	`risk` text,
	`status` text NOT NULL,
	`input_json` text,
	`output_summary` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orchestration_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`prompt` text NOT NULL,
	`preference` text NOT NULL,
	`task_kind` text NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`state_json` text DEFAULT '{}' NOT NULL,
	`tools_json` text DEFAULT '[]' NOT NULL,
	`pending_calls_json` text DEFAULT '[]' NOT NULL,
	`trace_json` text DEFAULT '[]' NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL
);
