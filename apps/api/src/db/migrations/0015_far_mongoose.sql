PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workspace_members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_workspace_members`("id", "workspace_id", "user_id", "role", "created_at") SELECT "id", "workspace_id", "user_id", CASE WHEN "role" = 'member' THEN 'user' ELSE "role" END, "created_at" FROM `workspace_members`;--> statement-breakpoint
DROP TABLE `workspace_members`;--> statement-breakpoint
ALTER TABLE `__new_workspace_members` RENAME TO `workspace_members`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_members_workspace_user_idx` ON `workspace_members` (`workspace_id`,`user_id`);