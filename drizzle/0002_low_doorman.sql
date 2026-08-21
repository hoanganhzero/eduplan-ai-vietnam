CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_email` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `username` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `password_salt` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `avatar_key` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `bio` text;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_username_unique` ON `accounts` (`username`);