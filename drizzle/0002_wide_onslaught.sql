ALTER TABLE `orders` ADD `submitted_by_user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `submitted_by_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `submitted_by_name` text DEFAULT '' NOT NULL;