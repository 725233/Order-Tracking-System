ALTER TABLE `order_items` ADD `payment_status` text DEFAULT 'Not Ready' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `payment_reference` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `payment_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `accounts_comment` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_order_items_payment_status` ON `order_items` (`payment_status`);--> statement-breakpoint
PRAGMA optimize;
