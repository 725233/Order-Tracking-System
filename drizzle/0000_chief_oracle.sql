CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`barcode` text DEFAULT '' NOT NULL,
	`description` text NOT NULL,
	`qty_required` integer NOT NULL,
	`qty_in_stock` integer DEFAULT 0 NOT NULL,
	`qty_to_order` integer DEFAULT 0 NOT NULL,
	`units` text DEFAULT 'pcs' NOT NULL,
	`selling_price` real DEFAULT 0 NOT NULL,
	`assigned_to` text DEFAULT '' NOT NULL,
	`procurement_status` text DEFAULT 'Unassigned' NOT NULL,
	`cost_price` real,
	`currency` text DEFAULT 'AED' NOT NULL,
	`supplier_po_number` text DEFAULT '' NOT NULL,
	`source_type` text DEFAULT '' NOT NULL,
	`supplier_name` text DEFAULT '' NOT NULL,
	`supplier_eta` text DEFAULT '' NOT NULL,
	`procurement_comment` text DEFAULT '' NOT NULL,
	`quote_complete` integer DEFAULT false NOT NULL,
	`approval_status` text DEFAULT 'Not Ready' NOT NULL,
	`approval_comment` text DEFAULT '' NOT NULL,
	`qty_received` integer DEFAULT 0 NOT NULL,
	`qty_sent` integer DEFAULT 0 NOT NULL,
	`actual_receive_date` text DEFAULT '' NOT NULL,
	`actual_delivery_date` text DEFAULT '' NOT NULL,
	`tracking_number` text DEFAULT '' NOT NULL,
	`shipment_weight` real,
	`logistics_status` text DEFAULT 'Awaiting Items' NOT NULL,
	`logistics_update` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_order_items_order_id` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_order_items_assigned_status` ON `order_items` (`assigned_to`,`procurement_status`);--> statement-breakpoint
CREATE INDEX `idx_order_items_approval_status` ON `order_items` (`approval_status`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`order_date` text NOT NULL,
	`sales_person` text NOT NULL,
	`emails` text DEFAULT '' NOT NULL,
	`client_name` text NOT NULL,
	`project_number` text DEFAULT '' NOT NULL,
	`project_category` text DEFAULT '' NOT NULL,
	`quotation_number` text DEFAULT '' NOT NULL,
	`pi_number` text DEFAULT '' NOT NULL,
	`so_number` text DEFAULT '' NOT NULL,
	`customer_po_number` text DEFAULT '' NOT NULL,
	`customer_reference` text DEFAULT '' NOT NULL,
	`planned_delivery_date` text NOT NULL,
	`status` text DEFAULT 'New Request' NOT NULL,
	`priority` text DEFAULT 'Normal' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
PRAGMA optimize;
