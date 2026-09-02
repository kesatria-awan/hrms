PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`owner_id` text NOT NULL,
	`clerk_org_id` text,
	`storage_used_bytes` integer DEFAULT 0 NOT NULL,
	`storage_quota_bytes` integer DEFAULT 524288000 NOT NULL,
	`billing_type` text DEFAULT 'subscription' NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_workspaces`("id", "name", "slug", "owner_id", "clerk_org_id", "storage_used_bytes", "storage_quota_bytes", "billing_type", "plan", "created_at", "updated_at", "deleted_at") SELECT "id", "name", "slug", "owner_id", "clerk_org_id", "storage_used_bytes", "storage_quota_bytes", "billing_type", "plan", "created_at", "updated_at", "deleted_at" FROM `workspaces`;--> statement-breakpoint
DROP TABLE `workspaces`;--> statement-breakpoint
ALTER TABLE `__new_workspaces` RENAME TO `workspaces`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_clerk_org_id_unique` ON `workspaces` (`clerk_org_id`);