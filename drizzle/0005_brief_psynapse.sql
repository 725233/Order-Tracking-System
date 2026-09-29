CREATE TABLE `order_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`body` text NOT NULL,
	`author_user_id` text NOT NULL,
	`author_email` text NOT NULL,
	`author_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_order_comments_order_created` ON `order_comments` (`order_id`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
