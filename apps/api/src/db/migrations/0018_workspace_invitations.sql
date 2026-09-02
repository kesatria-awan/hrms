CREATE TABLE `workspace_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`inviter_user_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_invitations_token_hash_unique` ON `workspace_invitations` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `workspace_invitations_workspace_id_idx` ON `workspace_invitations` (`workspace_id`);
--> statement-breakpoint
CREATE INDEX `workspace_invitations_email_idx` ON `workspace_invitations` (`email`);
