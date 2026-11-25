CREATE TABLE `team_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`from_email` text NOT NULL,
	`to_email` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`accepted_at` text
);
--> statement-breakpoint
CREATE TABLE `work_session_members` (
	`session_id` text NOT NULL,
	`member_email` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`session_id`, `member_email`)
);
