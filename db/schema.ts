import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  requestType: text("request_type").notNull().default("Customer Order"),
  websiteLead: integer("website_lead", { mode: "boolean" }).notNull().default(false),
  orderNumber: text("order_number").notNull().unique(),
  orderDate: text("order_date").notNull(),
  salesPerson: text("sales_person").notNull(),
  emails: text("emails").notNull().default(""),
  clientName: text("client_name").notNull(),
  projectNumber: text("project_number").notNull().default(""),
  projectCategory: text("project_category").notNull().default(""),
  quotationNumber: text("quotation_number").notNull().default(""),
  piNumber: text("pi_number").notNull().default(""),
  soNumber: text("so_number").notNull().default(""),
  customerPoNumber: text("customer_po_number").notNull().default(""),
  customerReference: text("customer_reference").notNull().default(""),
  plannedDeliveryDate: text("planned_delivery_date").notNull(),
  status: text("status").notNull().default("New Request"),
  priority: text("priority").notNull().default("Normal"),
  submittedByUserId: text("submitted_by_user_id").notNull().default(""),
  submittedByEmail: text("submitted_by_email").notNull().default(""),
  submittedByName: text("submitted_by_name").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const orderItems = sqliteTable("order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  barcode: text("barcode").notNull().default(""), customerReference: text("customer_reference").notNull().default(""), description: text("description").notNull(),
  leadTime: text("lead_time").notNull().default(""), plannedDeliveryDate: text("planned_delivery_date").notNull().default(""),
  qtyRequired: integer("qty_required").notNull(), qtyInStock: integer("qty_in_stock").notNull().default(0),
  qtyToOrder: integer("qty_to_order").notNull().default(0), units: text("units").notNull().default("pcs"),
  sellingPrice: real("selling_price").notNull().default(0), assignedTo: text("assigned_to").notNull().default(""),
  procurementStatus: text("procurement_status").notNull().default("Unassigned"), costPrice: real("cost_price"),
  currency: text("currency").notNull().default("AED"), supplierPoNumber: text("supplier_po_number").notNull().default(""),
  sourceType: text("source_type").notNull().default(""), supplierName: text("supplier_name").notNull().default(""),
  sourceLink: text("source_link").notNull().default(""),
  supplierEta: text("supplier_eta").notNull().default(""), procurementComment: text("procurement_comment").notNull().default(""),
  quoteComplete: integer("quote_complete", { mode: "boolean" }).notNull().default(false),
  approvalStatus: text("approval_status").notNull().default("Not Ready"), approvalComment: text("approval_comment").notNull().default(""),
  managementRecommendedSupplier: text("management_recommended_supplier").notNull().default(""),
  managementRecommendedLink: text("management_recommended_link").notNull().default(""),
  managementRecommendedPrice: real("management_recommended_price"),
  managementRecommendedCurrency: text("management_recommended_currency").notNull().default("AED"),
  paymentStatus: text("payment_status").notNull().default("Not Ready"), paymentReference: text("payment_reference").notNull().default(""),
  paymentDate: text("payment_date").notNull().default(""), accountsComment: text("accounts_comment").notNull().default(""),
  qtyReceived: integer("qty_received").notNull().default(0), qtySent: integer("qty_sent").notNull().default(0),
  actualReceiveDate: text("actual_receive_date").notNull().default(""), actualDeliveryDate: text("actual_delivery_date").notNull().default(""),
  trackingNumber: text("tracking_number").notNull().default(""), shipmentWeight: real("shipment_weight"),
  logisticsStatus: text("logistics_status").notNull().default("Awaiting Items"), logisticsUpdate: text("logistics_update").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_order_items_order_id").on(table.orderId),
  index("idx_order_items_assigned_status").on(table.assignedTo, table.procurementStatus),
  index("idx_order_items_approval_status").on(table.approvalStatus),
  index("idx_order_items_payment_status").on(table.paymentStatus),
]);

export const orderComments = sqliteTable("order_comments", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  authorUserId: text("author_user_id").notNull(),
  authorEmail: text("author_email").notNull(),
  authorName: text("author_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_order_comments_order_created").on(table.orderId, table.createdAt),
]);

export const appUsers = sqliteTable("app_users", {
  email: text("email").primaryKey(),
  name: text("name").notNull().default(""),
  roles: text("roles").notNull().default("All Orders Status"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_app_users_active").on(table.active),
]);
