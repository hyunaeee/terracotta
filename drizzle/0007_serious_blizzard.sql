CREATE TABLE `project_file_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`job_id` text,
	`action` text NOT NULL,
	`path` text,
	`status` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`agent_id` text,
	`root_path` text DEFAULT '.' NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`model_preference` text DEFAULT 'latest' NOT NULL,
	`file_access` text DEFAULT 'read-write' NOT NULL,
	`command_access` text DEFAULT 'approval' NOT NULL,
	`color` text DEFAULT '#78906f' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
ALTER TABLE `local_agent_jobs` ADD `project_id` text;--> statement-breakpoint
ALTER TABLE `local_agent_jobs` ADD `operation` text DEFAULT 'run_terminal_command' NOT NULL;--> statement-breakpoint
ALTER TABLE `local_agent_jobs` ADD `args_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `local_agent_jobs` ADD `changed_files_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_sessions` ADD `project_id` text;