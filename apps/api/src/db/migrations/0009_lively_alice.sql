-- Create workspace_members table for many-to-many relationship
CREATE TABLE `workspace_members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_members_workspace_user_idx` ON `workspace_members` (`workspace_id`,`user_id`);
--> statement-breakpoint
-- Add is_super_admin column to users table
ALTER TABLE `users` ADD `is_super_admin` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- Migrate existing users with workspace_id to workspace_members
-- Map workspace_admin -> admin, member -> member
INSERT INTO `workspace_members` (`id`, `workspace_id`, `user_id`, `role`, `created_at`)
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))) as id,
    `workspace_id`,
    `id` as user_id,
    CASE
        WHEN `role` = 'workspace_admin' THEN 'admin'
        ELSE 'member'
    END as role,
    `created_at`
FROM `users`
WHERE `workspace_id` IS NOT NULL;
--> statement-breakpoint
-- Set is_super_admin flag for existing super_admin users
UPDATE `users` SET `is_super_admin` = 1 WHERE `role` = 'super_admin';