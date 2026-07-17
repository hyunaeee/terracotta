CREATE TABLE `mcp_connections` (
	`id` text NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`server_url` text NOT NULL,
	`category` text DEFAULT 'custom' NOT NULL,
	`status` text DEFAULT 'not_connected' NOT NULL,
	`auth_type` text DEFAULT 'oauth' NOT NULL,
	`tool_count` integer DEFAULT 0 NOT NULL,
	`tools_json` text DEFAULT '[]' NOT NULL,
	`encrypted_access_token` text,
	`encrypted_refresh_token` text,
	`token_expires_at` text,
	`oauth_client_id` text,
	`encrypted_client_secret` text,
	`authorization_endpoint` text,
	`token_endpoint` text,
	`scopes` text,
	`last_checked_at` text,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`id`, `owner_id`)
);
--> statement-breakpoint
CREATE TABLE `mcp_oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`encrypted_verifier` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`resource` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL
);
