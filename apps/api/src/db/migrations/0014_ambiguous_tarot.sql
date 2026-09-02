ALTER TABLE `workspaces` ADD `subscription_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `chip_purchase_token` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `chip_client_id` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `billing_period_start` integer;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `billing_period_end` integer;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `cancelled_at` integer;