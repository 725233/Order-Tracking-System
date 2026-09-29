import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { appUsers, orderComments, orderItems, orders } from "../../../db/schema";
import { syncOrderToGoogleSheets } from "../../../lib/google-sheets";
import { requireAppAccess } from "../../../lib/access";

function submittedByDisplayName(request: Request, email: string) {
  const encodedName = request.headers.get("oai-authenticated-user-full-name")?.trim() || "";
  if (encodedName && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try {
      return decodeURIComponent(encodedName);
    } catch {
      // A display-name decoding issue must never prevent the order from saving.
    }
  }
  return email.split("@")[0]?.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Signed-in user";
}

export async function GET(request: Request) {
  try {
    const auth = await requireAppAccess(request);
    if (auth.error) return auth.error;
    const currentUserId = request.headers.get("oai-authenticated-user-id")?.trim() || "";
    const db = getDb();
    const orderRows = await db.select().from(orders).orderBy(desc(orders.createdAt));
    const itemRows = await db.select().from(orderItems);
    const commentRows = await db.select().from(orderComments);
    const userRows = await db.select().from(appUsers);
    const internalNames = new Map(userRows.filter((user) => user.name.trim()).map((user) => [user.email.toLowerCase(), user.name.trim()]));
    return Response.json({ orders: orderRows.map((order) => { const visibleOrder = { ...order, submittedByName: internalNames.get(order.submittedByEmail.toLowerCase()) || order.submittedByName, submittedByUserId: undefined }; return { ...visibleOrder, canDelete: Boolean(currentUserId), items: itemRows.filter((item) => item.orderId === order.id).map((item) => ({ ...item, customerReference: item.customerReference || order.customerReference })), comments: commentRows.filter((comment) => comment.orderId === order.id).map((comment) => ({ ...comment, authorUserId: undefined })).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }; }) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load orders" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAppAccess(request, ["Sales Coordinator"]);
    if (auth.error) return auth.error;
    const submittedByUserId = request.headers.get("oai-authenticated-user-id")?.trim() || "";
    const submittedByEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || "";
    const submittedByName = auth.access.name || submittedByDisplayName(request, submittedByEmail);
    if (!submittedByUserId || !submittedByEmail) return Response.json({ error: "Please sign in before submitting an order" }, { status: 401 });
    const payload = await request.json() as Record<string, unknown>;
    const requestType = String(payload.requestType ?? "").trim();
    if (!["BOM", "Stock Request", "Customer Order"].includes(requestType)) {
      return Response.json({ error: "Select BOM, Stock Request, or Customer Order" }, { status: 400 });
    }
    const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];
    for (const field of ["orderNumber", "orderDate", "salesPerson", "clientName", "plannedDeliveryDate"]) {
      if (!String(payload[field] ?? "").trim()) return Response.json({ error: `${field} is required` }, { status: 400 });
    }
    if (!items.length || items.some((item) => !String(item.description ?? "").trim() || Number(item.qtyRequired) < 1)) {
      return Response.json({ error: "Add at least one item with a description and quantity" }, { status: 400 });
    }
    const db = getDb();
    const orderId = crypto.randomUUID();
    const value = (key: string) => String(payload[key] ?? "").trim();
    const websiteLead = requestType === "Customer Order" && (payload.websiteLead === true || ["true", "on", "1"].includes(String(payload.websiteLead ?? "").toLowerCase()));
    const order = { id: orderId, requestType, websiteLead, orderNumber: value("orderNumber"), orderDate: value("orderDate"), salesPerson: value("salesPerson"),
      emails: value("emails"), clientName: value("clientName"), projectNumber: value("projectNumber"), projectCategory: value("projectCategory"),
      quotationNumber: value("quotationNumber"), piNumber: value("piNumber"), soNumber: value("soNumber"),
      customerPoNumber: value("customerPoNumber"), customerReference: value("customerReference"), plannedDeliveryDate: value("plannedDeliveryDate"),
      submittedByUserId, submittedByEmail, submittedByName };
    const itemValues = items.map((item) => { const qtyRequired = Number(item.qtyRequired) || 0; const qtyInStock = Number(item.qtyInStock) || 0;
      return { id: crypto.randomUUID(), orderId, barcode: String(item.barcode ?? "").trim(), customerReference: String(item.customerReference ?? "").trim(), description: String(item.description ?? "").trim(),
        leadTime: String(item.leadTime ?? "").trim(), plannedDeliveryDate: String(item.plannedDeliveryDate ?? "").trim(),
        qtyRequired, qtyInStock, qtyToOrder: Math.max(0, qtyRequired - qtyInStock), units: String(item.units ?? "pcs").trim(), sellingPrice: Number(item.sellingPrice) || 0 }; });
    await db.batch([
      db.insert(orders).values(order),
      ...itemValues.map((item) => db.insert(orderItems).values(item)),
    ]);
    const createdOrder = { ...order, status: "New Request", priority: "Normal", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await syncOrderToGoogleSheets(createdOrder, itemValues, {
      action: "Order created", department: "Sales Coordinator",
      summary: `${itemValues.length} item${itemValues.length === 1 ? "" : "s"} submitted by ${submittedByName}; planned delivery ${order.plannedDeliveryDate}.`,
    });
    const visibleCreatedOrder = { ...createdOrder, submittedByUserId: undefined };
    return Response.json({ order: { ...visibleCreatedOrder, canDelete: true, items: itemValues } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create order";
    console.error("Order submission failed", message);
    return Response.json({ error: message.includes("UNIQUE") ? "This order number already exists" : message }, { status: 500 });
  }
}
