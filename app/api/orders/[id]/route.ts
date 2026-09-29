import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "../../../../db";
import { orderItems, orders } from "../../../../db/schema";
import { syncOrderToGoogleSheets } from "../../../../lib/google-sheets";
import { requireAppAccess } from "../../../../lib/access";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAppAccess(request, ["Sales Coordinator"]);
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const payload = await request.json() as Record<string, unknown>;
    const requestType = String(payload.requestType ?? "").trim();
    if (!["BOM", "Stock Request", "Customer Order"].includes(requestType)) return Response.json({ error: "Select BOM, Stock Request, or Customer Order" }, { status: 400 });
    for (const field of ["orderNumber", "orderDate", "salesPerson", "clientName", "plannedDeliveryDate"]) {
      if (!String(payload[field] ?? "").trim()) return Response.json({ error: `${field} is required` }, { status: 400 });
    }
    const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];
    if (!items.length || items.some((item) => !String(item.description ?? "").trim() || Number(item.qtyRequired) < 1)) return Response.json({ error: "Keep at least one item with a description and quantity" }, { status: 400 });

    const db = getDb();
    const [currentOrder] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!currentOrder) return Response.json({ error: "Order not found" }, { status: 404 });
    const currentItems = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
    const currentItemIds = new Set(currentItems.map((item) => item.id));
    const submittedIds = items.map((item) => String(item.id ?? "").trim()).filter(Boolean);
    if (submittedIds.some((itemId) => !currentItemIds.has(itemId))) return Response.json({ error: "One of the edited items does not belong to this order" }, { status: 400 });

    const value = (key: string) => String(payload[key] ?? "").trim();
    const websiteLead = requestType === "Customer Order" && (payload.websiteLead === true || ["true", "on", "1"].includes(String(payload.websiteLead ?? "").toLowerCase()));
    const newItemIds: string[] = [];
    const statements: BatchItem<"sqlite">[] = [db.update(orders).set({
      requestType, websiteLead, orderNumber: value("orderNumber"), orderDate: value("orderDate"), salesPerson: value("salesPerson"), emails: value("emails"),
      clientName: value("clientName"), projectNumber: value("projectNumber"), projectCategory: value("projectCategory"), quotationNumber: value("quotationNumber"),
      piNumber: value("piNumber"), soNumber: value("soNumber"), customerPoNumber: value("customerPoNumber"), plannedDeliveryDate: value("plannedDeliveryDate"),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    }).where(eq(orders.id, id))];

    for (const item of items) {
      const qtyRequired = Number(item.qtyRequired) || 0;
      const qtyInStock = Number(item.qtyInStock) || 0;
      const salesFields = {
        barcode: String(item.barcode ?? "").trim(), customerReference: String(item.customerReference ?? "").trim(), description: String(item.description ?? "").trim(),
        leadTime: String(item.leadTime ?? "").trim(), plannedDeliveryDate: String(item.plannedDeliveryDate ?? "").trim(),
        qtyRequired, qtyInStock, qtyToOrder: Math.max(0, qtyRequired - qtyInStock), units: String(item.units ?? "pcs").trim(),
        sellingPrice: Number(item.sellingPrice) || 0, updatedAt: sql`CURRENT_TIMESTAMP` as unknown as string,
      };
      const itemId = String(item.id ?? "").trim();
      if (itemId) statements.push(db.update(orderItems).set(salesFields).where(eq(orderItems.id, itemId)));
      else {
        const newId = crypto.randomUUID(); newItemIds.push(newId);
        statements.push(db.insert(orderItems).values({ id: newId, orderId: id, ...salesFields }));
      }
    }
    const retainedIds = new Set(submittedIds);
    for (const item of currentItems) if (!retainedIds.has(item.id)) statements.push(db.delete(orderItems).where(eq(orderItems.id, item.id)));
    if (newItemIds.length) statements.push(db.update(orders).set({ status: "New Request" }).where(eq(orders.id, id)));
    await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

    const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    const updatedItems = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
    await syncOrderToGoogleSheets(updatedOrder, updatedItems, { action: "Order revised", department: "Sales Coordinator", summary: `Order details revised; ${updatedItems.length} item${updatedItems.length === 1 ? "" : "s"} now listed.` });
    const visibleOrder = { ...updatedOrder, submittedByUserId: undefined };
    return Response.json({ order: { ...visibleOrder, canDelete: true, items: updatedItems } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update order";
    console.error("Order update failed", message);
    return Response.json({ error: message.includes("UNIQUE") ? "This order number already exists" : message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAppAccess(request, ["Sales Coordinator"]);
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const db = getDb();
    const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    await db.delete(orders).where(eq(orders.id, id));
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not delete order" }, { status: 500 });
  }
}
