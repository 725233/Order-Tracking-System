ALTER TABLE `order_items` ADD `lead_time` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `planned_delivery_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `website_lead` integer DEFAULT false NOT NULL;