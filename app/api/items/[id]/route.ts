import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { orderComments, orderItems, orders } from "../../../../db/schema";
import { syncOrderToGoogleSheets } from "../../../../lib/google-sheets";
import { requireAppAccess } from "../../../../lib/access";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const roleForAction = action === "assign" ? "Procurement Manager" : action === "quote" || action === "eta" ? "Procurement" : action === "approve" ? "Management Approval" : action === "accounts" ? "Accounts" : action === "logistics" ? "Logistics" : null;
    if (!roleForAction) return Response.json({ error: "Unknown action" }, { status: 400 });
    const auth = await requireAppAccess(request, [roleForAction]);
    if (auth.error) return auth.error;
    const db = getDb();
    const [current] = await db.select().from(orderItems).where(eq(orderItems.id, id)).limit(1);
    if (!current) return Response.json({ error: "Item not found" }, { status: 404 });
    let changes: Partial<typeof orderItems.$inferInsert> = { updatedAt: sql`CURRENT_TIMESTAMP` as unknown as string };
    if (action === "assign") changes = { ...changes, assignedTo: String(payload.assignedTo ?? "").trim(), procurementStatus: "Assigned" };
    else if (action === "quote") {
      const currency = normalizedCurrency(payload.currency);
      if (!currency) return Response.json({ error: "Enter a valid three-letter currency code." }, { status: 400 });
      changes = { ...changes, costPrice: Number(payload.costPrice) || 0, currency,
        supplierPoNumber: String(payload.supplierPoNumber ?? ""), sourceType: String(payload.sourceType ?? ""), supplierName: String(payload.supplierName ?? ""),
        sourceLink: String(payload.sourceLink ?? ""), supplierEta: String(payload.supplierEta ?? ""), procurementComment: String(payload.procurementComment ?? ""), procurementStatus: "Sourcing & Purchasing Complete",
        quoteComplete: true, approvalStatus: "Awaiting Approval" };
    }
    else if (action === "eta") {
      if (!current.quoteComplete) return Response.json({ error: "Submit the sourcing and purchasing details before adjusting the ETA." }, { status: 409 });
      const supplierEta = String(payload.supplierEta ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(supplierEta) || Number.isNaN(new Date(`${supplierEta}T00:00:00Z`).getTime())) return Response.json({ error: "Enter a valid supplier ETA." }, { status: 400 });
      const etaUpdateNote = String(payload.etaUpdateNote ?? "").trim().slice(0, 1000);
      const etaHistory = `ETA adjusted from ${current.supplierEta || "not set"} to ${supplierEta}${etaUpdateNote ? `. Reason: ${etaUpdateNote}` : ""}.`;
      changes = { ...changes, supplierEta, procurementComment: [current.procurementComment, etaHistory].filter(Boolean).join("\n\n") };
    }
    else if (action === "approve") {
      if (!current.quoteComplete) return Response.json({ error: "Procurement must complete sourcing and purchasing before this item can be approved." }, { status: 409 });
      const approvalDecision = String(payload.approvalStatus ?? "Approved");
      if (!["Approved", "Change Supplier"].includes(approvalDecision)) return Response.json({ error: "Choose Approve or Change Supplier." }, { status: 400 });
      const approvalComment = String(payload.approvalComment ?? "").trim();
      const recommendedSupplier = String(payload.managementRecommendedSupplier ?? "").trim();
      const recommendedLink = String(payload.managementRecommendedLink ?? "").trim();
      const recommendedPriceValue = String(payload.managementRecommendedPrice ?? "").trim();
      const recommendedPrice = recommendedPriceValue ? Number(recommendedPriceValue) : null;
      const recommendedCurrency = normalizedCurrency(payload.managementRecommendedCurrency ?? "AED");
      if (recommendedPriceValue && !recommendedCurrency) return Response.json({ error: "Enter a valid three-letter currency code for the recommended price." }, { status: 400 });
      if (approvalDecision === "Change Supplier" && !recommendedSupplier && !recommendedLink) {
        return Response.json({ error: "Add the recommended supplier or source link before changing the supplier." }, { status: 400 });
      }
      const recommendation = [
        approvalComment,
        recommendedSupplier ? `Recommended supplier: ${recommendedSupplier}` : "",
        recommendedLink ? `Recommended link: ${recommendedLink}` : "",
        recommendedPrice != null && Number.isFinite(recommendedPrice) ? `Recommended price: ${recommendedCurrency || "AED"} ${recommendedPrice.toFixed(2)}` : "",
      ].filter(Boolean).join(" · ");
      changes = {
        ...changes,
        approvalStatus: "Approved",
        approvalComment,
        managementRecommendedSupplier: recommendedSupplier,
        managementRecommendedLink: recommendedLink,
        managementRecommendedPrice: recommendedPrice != null && Number.isFinite(recommendedPrice) ? recommendedPrice : null,
        managementRecommendedCurrency: recommendedCurrency || "AED",
        paymentStatus: "Queued for Payment",
        procurementStatus: approvalDecision === "Change Supplier" ? "Supplier Changed by Management Approver" : "Approved by Management Approver",
        quoteComplete: true,
      };
    }
    else if (action === "accounts") {
      if (current.approvalStatus !== "Approved") return Response.json({ error: "Management Approver must approve this item before Accounts can update payment." }, { status: 409 });
      changes = { ...changes, paymentStatus: String(payload.paymentStatus ?? "Queued for Payment"), paymentReference: String(payload.paymentReference ?? ""), paymentDate: String(payload.paymentDate ?? ""), accountsComment: String(payload.accountsComment ?? "") };
    }
    else if (action === "logistics") {
      if (current.paymentStatus !== "Paid") return Response.json({ error: "This item must be marked paid by Accounts before Logistics can update it." }, { status: 409 });
      changes = { ...changes, qtyReceived: Number(payload.qtyReceived) || 0, qtySent: Number(payload.qtySent) || 0,
      actualReceiveDate: String(payload.actualReceiveDate ?? ""), actualDeliveryDate: String(payload.actualDeliveryDate ?? ""), trackingNumber: String(payload.trackingNumber ?? ""),
      shipmentWeight: Number(payload.shipmentWeight) || 0, logisticsStatus: String(payload.logisticsStatus ?? "Awaiting Items"), logisticsUpdate: String(payload.logisticsUpdate ?? "") };
    }
    else return Response.json({ error: "Unknown action" }, { status: 400 });
    const [item] = await db.update(orderItems).set(changes).where(eq(orderItems.id, id)).returning();
    const siblings = await db.select().from(orderItems).where(eq(orderItems.orderId, current.orderId));
    const rows = siblings.map((row) => row.id === id ? item : row);
    const orderStatus = rows.every((row) => row.logisticsStatus === "Delivered") ? "Delivered"
      : rows.every((row) => row.paymentStatus === "Paid") ? "Ready for Logistics"
      : rows.some((row) => row.paymentStatus === "Paid") ? "Partially Paid"
      : rows.every((row) => row.approvalStatus === "Approved") ? "Queued for Payment"
      : rows.some((row) => row.approvalStatus === "Approved") ? "Partially Approved"
      : rows.every((row) => row.quoteComplete) ? "Awaiting Management Approval"
      : action === "assign" ? "Assigned" : undefined;
    if (orderStatus) await db.update(orders).set({ status: orderStatus, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(orders.id, current.orderId));
    const [order] = await db.select().from(orders).where(eq(orders.id, current.orderId)).limit(1);
    if (action === "approve") {
      const authorEmail = request.headers.get("oai-authenticated-user-email") ?? "";
      const authorName = auth.access.name || decodeHeader(request.headers.get("oai-authenticated-user-full-name")) || authorEmail || "Management Approver";
      const recommendation = [
        item.approvalComment,
        item.managementRecommendedSupplier ? `Recommended supplier: ${item.managementRecommendedSupplier}` : "",
        item.managementRecommendedLink ? `Recommended link: ${item.managementRecommendedLink}` : "",
        item.managementRecommendedPrice != null ? `Recommended price: ${item.managementRecommendedCurrency || "AED"} ${item.managementRecommendedPrice.toFixed(2)}` : "",
      ].filter(Boolean).join(" · ");
      await db.insert(orderComments).values({
        id: crypto.randomUUID(),
        orderId: current.orderId,
        body: `${item.description}: ${item.procurementStatus === "Supplier Changed by Management Approver" ? "Supplier changed and sent to Accounts" : "Approved and sent to Accounts"}. Procurement source: ${current.supplierName || current.sourceType || "not specified"}${current.sourceLink ? ` (${current.sourceLink})` : ""}. ${recommendation}`.trim(),
        authorUserId: request.headers.get("oai-authenticated-user-id") ?? (authorEmail || "management-approval"),
        authorEmail,
        authorName,
      });
    }
    const activity = activityForUpdate(action, item);
    if (order) await syncOrderToGoogleSheets(order, rows, activity);
    return Response.json({ item });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update item" }, { status: 500 });
  }
}

function activityForUpdate(action: string, item: typeof orderItems.$inferSelect) {
  if (action === "assign") return { action: "Assignment updated", department: "Procurement Manager", itemId: item.id, itemDescription: item.description, summary: `Assigned to ${item.assignedTo || "Unassigned"}.` };
  if (action === "quote") return { action: "Sourcing and purchasing updated", department: "Procurement", itemId: item.id, itemDescription: item.description, summary: `Sourcing complete; supplier ${item.supplierName || "not set"}; supplier ETA ${item.supplierEta || "not set"}. ${item.procurementComment}`.trim() };
  if (action === "eta") return { action: "Supplier ETA adjusted", department: "Procurement", itemId: item.id, itemDescription: item.description, summary: `Revised supplier ETA: ${item.supplierEta || "not set"}. ${item.procurementComment}`.trim() };
  if (action === "approve") return { action: "Approval updated", department: "Management Approval", itemId: item.id, itemDescription: item.description, summary: `Decision: ${item.procurementStatus === "Supplier Changed by Management Approver" ? "Supplier changed; sent to Accounts" : "Approved; sent to Accounts"}. ${item.approvalComment} ${item.managementRecommendedSupplier ? `Recommended supplier: ${item.managementRecommendedSupplier}.` : ""} ${item.managementRecommendedLink ? `Recommended link: ${item.managementRecommendedLink}.` : ""}`.trim() };
  if (action === "accounts") return { action: "Payment updated", department: "Accounts", itemId: item.id, itemDescription: item.description, summary: `Payment status: ${item.paymentStatus}. ${item.accountsComment}`.trim() };
  return { action: "Logistics updated", department: "Logistics", itemId: item.id, itemDescription: item.description, summary: `Status: ${item.logisticsStatus}; received ${item.qtyReceived}; sent ${item.qtySent}. ${item.logisticsUpdate}`.trim() };
}

function decodeHeader(value: string | null) {
  if (!value) return "";
  try { return decodeURIComponent(value); } catch { return value; }
}

function normalizedCurrency(value: unknown) {
  const currency = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "";
}
