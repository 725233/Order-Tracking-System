import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { orderComments, orderItems, orders } from "../../../../db/schema";

const departments = ["Sales Coordinator", "Procurement Manager", "Procurement", "Management Approval", "Accounts", "Logistics"] as const;
type Department = typeof departments[number];
type Order = typeof orders.$inferSelect;
type Item = typeof orderItems.$inferSelect;
type Comment = typeof orderComments.$inferSelect;
type ReminderRow = { order: Order; item: Item; status: string; latestUpdate: string; deliveryDate: string; urgency: "overdue" | "urgent" | "normal" };

const liveUrl = env.APP_BASE_URL?.trim() || "https://orders.example.com";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const suppliedToken = requestUrl.searchParams.get("key") || "";
  const expectedToken = env.REMINDER_AUTOMATION_TOKEN?.trim() || "";
  if (!expectedToken || suppliedToken.length !== expectedToken.length || suppliedToken !== expectedToken) {
    return json({ error: "Reminder feed access is not authorized." }, 401);
  }

  try {
    const db = getDb();
    const [orderRows, itemRows, commentRows] = await Promise.all([
      db.select().from(orders),
      db.select().from(orderItems),
      db.select().from(orderComments),
    ]);
    const requestedDepartment = requestUrl.searchParams.get("department")?.trim() || "";
    const rowsByDepartment = new Map<Department, ReminderRow[]>();
    for (const department of departments) rowsByDepartment.set(department, reminderRows(department, orderRows, itemRows, commentRows));

    if (!requestedDepartment) {
      return json({
        generatedAt: new Date().toISOString(),
        recipient: reminderRecipient(),
        departments: departments.map((department) => {
          const rows = rowsByDepartment.get(department) || [];
          return { department, pendingItems: rows.length, pendingOrders: new Set(rows.map((row) => row.order.id)).size };
        }),
      });
    }
    if (!departments.includes(requestedDepartment as Department)) return json({ error: "Unknown department." }, 400);
    const department = requestedDepartment as Department;
    const rows = rowsByDepartment.get(department) || [];
    if (!rows.length) return json({ department, skip: true, reason: "No pending items for this department.", generatedAt: new Date().toISOString() });
    const email = buildEmail(department, rows);
    return json({ ...email, to: reminderRecipient(), department, skip: false, pendingItems: rows.length, pendingOrders: new Set(rows.map((row) => row.order.id)).size, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Reminder digest error", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "The reminder digest could not be prepared." }, 500);
  }
}

function reminderRows(department: Department, orderRows: Order[], itemRows: Item[], commentRows: Comment[]) {
  const orderById = new Map(orderRows.map((order) => [order.id, order]));
  const latestCommentByOrder = new Map<string, Comment>();
  for (const comment of commentRows) {
    const current = latestCommentByOrder.get(comment.orderId);
    if (!current || current.createdAt < comment.createdAt) latestCommentByOrder.set(comment.orderId, comment);
  }
  return itemRows.flatMap((item) => {
    const order = orderById.get(item.orderId);
    if (!order || !isPendingFor(department, item)) return [];
    const deliveryDate = item.plannedDeliveryDate || order.plannedDeliveryDate;
    return [{ order, item, deliveryDate, urgency: urgencyFor(deliveryDate), status: statusFor(department, item), latestUpdate: latestUpdateFor(department, item, latestCommentByOrder.get(order.id)) } satisfies ReminderRow];
  }).sort((left, right) => urgencyRank(left.urgency) - urgencyRank(right.urgency) || left.deliveryDate.localeCompare(right.deliveryDate) || left.order.orderNumber.localeCompare(right.order.orderNumber)).slice(0, 100);
}

function isPendingFor(department: Department, item: Item) {
  if (department === "Sales Coordinator") return item.logisticsStatus !== "Delivered";
  if (department === "Procurement Manager") return !item.assignedTo.trim() && item.approvalStatus !== "Approved";
  if (department === "Procurement") return Boolean(item.assignedTo.trim()) && !item.quoteComplete && item.approvalStatus !== "Approved";
  if (department === "Management Approval") return item.quoteComplete && item.approvalStatus !== "Approved";
  if (department === "Accounts") return item.approvalStatus === "Approved" && item.paymentStatus !== "Paid";
  return item.paymentStatus === "Paid" && item.logisticsStatus !== "Delivered";
}

function statusFor(department: Department, item: Item) {
  if (department === "Procurement Manager") return "PIC assignment required";
  if (department === "Procurement") return item.procurementStatus === "Unassigned" ? "Sourcing & buying required" : item.procurementStatus;
  if (department === "Management Approval") return "Management Approver approval required";
  if (department === "Accounts") return item.paymentStatus === "Not Ready" ? "Payment pending" : item.paymentStatus;
  if (department === "Logistics") return item.logisticsStatus || "Awaiting items";
  if (!item.assignedTo) return "Awaiting Procurement assignment";
  if (!item.quoteComplete) return "Sourcing & buying";
  if (item.approvalStatus !== "Approved") return "Awaiting Management Approver approval";
  if (item.paymentStatus !== "Paid") return "Awaiting payment";
  return item.logisticsStatus || "Logistics in progress";
}

function latestUpdateFor(department: Department, item: Item, comment?: Comment) {
  const departmentUpdate = department === "Logistics" ? item.logisticsUpdate
    : department === "Accounts" ? item.accountsComment || item.approvalComment
      : department === "Management Approval" ? item.procurementComment
        : department === "Procurement" ? item.procurementComment
          : item.procurementComment || item.approvalComment || item.accountsComment || item.logisticsUpdate;
  const values = [departmentUpdate, comment?.body].map((value) => clean(value, 260)).filter(Boolean);
  return [...new Set(values)].join(" • ") || "No update added yet.";
}

function buildEmail(department: Department, rows: ReminderRow[]) {
  const grouped = new Map<string, ReminderRow[]>();
  for (const row of rows) grouped.set(row.order.id, [...(grouped.get(row.order.id) || []), row]);
  const overdue = rows.filter((row) => row.urgency === "overdue").length;
  const urgent = rows.filter((row) => row.urgency === "urgent").length;
  const orderCount = grouped.size;
  const subject = `OrderFlow Order Reminder | ${department} | ${rows.length} pending item${rows.length === 1 ? "" : "s"}`;
  const cards = [...grouped.values()].map((orderRows) => orderCard(orderRows[0].order, orderRows)).join("");
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 10px"><tr><td align="center"><table role="presentation" width="680" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbe4ef"><tr><td style="background:#071c33;padding:24px 28px"><div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:.3px">ORDERFLOW</div><div style="margin-top:12px;font-size:12px;font-weight:700;color:#8fc9ff;text-transform:uppercase;letter-spacing:1.4px">Department follow-up</div><div style="margin-top:6px;font-size:25px;line-height:32px;font-weight:700;color:#ffffff">${escapeHtml(department)}</div></td></tr><tr><td style="padding:24px 28px 8px"><p style="margin:0;font-size:15px;line-height:23px;color:#475569">These are the items currently waiting for action from <strong style="color:#172033">${escapeHtml(department)}</strong>. Completed items are excluded.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px"><tr>${summaryCell(String(orderCount), "Pending orders", "#eaf4ff", "#0b6bcb")}${summaryCell(String(rows.length), "Pending items", "#eefcf5", "#087b4c")}${summaryCell(String(overdue), "Overdue", "#fff0f0", "#ba1a1a")}${summaryCell(String(urgent), "Due within 7 days", "#fff8e6", "#9a6500")}</tr></table></td></tr><tr><td style="padding:12px 28px 6px">${cards}</td></tr><tr><td align="center" style="padding:16px 28px 28px"><a href="${liveUrl}" style="display:inline-block;background:#0b6bcb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 20px;border-radius:9px">Open Order Tracking System</a><p style="margin:18px 0 0;font-size:11px;line-height:18px;color:#94a3b8">Automatic reminder generated ${escapeHtml(formatDateTime(new Date()))}. Please update the order in the system after taking action.</p></td></tr></table></td></tr></table></body></html>`;
  const text = [`ORDERFLOW ORDER REMINDER — ${department}`, `${orderCount} pending orders | ${rows.length} pending items | ${overdue} overdue | ${urgent} due within 7 days`, "", ...[...grouped.values()].flatMap((orderRows) => textOrder(orderRows[0].order, orderRows)), "", `Open the system: ${liveUrl}`].join("\n");
  return { subject, html, text };
}

function orderCard(order: Order, rows: ReminderRow[]) {
  const colors = typeColors(order.requestType);
  const itemRows = rows.map((row) => {
    const urgency = urgencyLabel(row.urgency, row.deliveryDate);
    return `<tr><td style="padding:14px 0;border-top:1px solid #edf1f5"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding-right:12px;vertical-align:top"><div style="font-size:14px;font-weight:700;line-height:20px;color:#172033">${escapeHtml(row.item.description)}</div><div style="margin-top:4px;font-size:12px;line-height:18px;color:#64748b">${escapeHtml(row.item.barcode || "No barcode")} · Qty ${row.item.qtyRequired} ${escapeHtml(row.item.units)}</div></td><td align="right" style="vertical-align:top;white-space:nowrap"><span style="display:inline-block;padding:5px 8px;border-radius:999px;background:${urgency.background};color:${urgency.color};font-size:11px;font-weight:700">${escapeHtml(urgency.text)}</span></td></tr></table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:11px;background:#f8fafc;border-radius:8px"><tr><td style="width:50%;padding:9px 10px;vertical-align:top"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8">Current status</div><div style="margin-top:4px;font-size:13px;font-weight:700;color:#334155">${escapeHtml(row.status)}</div></td><td style="width:50%;padding:9px 10px;vertical-align:top"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8">Delivery / ETA</div><div style="margin-top:4px;font-size:13px;font-weight:700;color:#334155">${escapeHtml(displayDate(row.deliveryDate))}${row.item.supplierEta ? ` · Supplier ${escapeHtml(displayDate(row.item.supplierEta))}` : ""}</div></td></tr></table><div style="margin-top:10px;font-size:12px;line-height:18px;color:#526176"><strong style="color:#334155">Latest update:</strong> ${escapeHtml(row.latestUpdate)}</div></td></tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:16px;border:1px solid #dbe4ef;border-radius:12px"><tr><td style="padding:14px 16px;background:#f8fafc;border-bottom:1px solid #e5ebf2"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td><div style="font-size:16px;font-weight:700;color:#0b6bcb">${escapeHtml(order.orderNumber)}</div><div style="margin-top:4px;font-size:13px;color:#475569">${escapeHtml(order.clientName || "Internal request")} · ${escapeHtml(order.salesPerson)}</div></td><td align="right"><span style="display:inline-block;padding:5px 9px;border-radius:999px;background:${colors.background};color:${colors.color};font-size:11px;font-weight:700">${escapeHtml(order.requestType)}</span></td></tr></table></td></tr><tr><td style="padding:0 16px">${itemRows}</td></tr></table>`;
}

function textOrder(order: Order, rows: ReminderRow[]) {
  return [`${order.orderNumber} — ${order.clientName || "Internal request"} (${order.requestType})`, ...rows.map((row) => `• ${row.item.description} | ${row.status} | Delivery ${displayDate(row.deliveryDate)} | ${row.latestUpdate}`), ""];
}

function summaryCell(value: string, label: string, background: string, color: string) {
  return `<td style="width:25%;padding:4px"><div style="min-height:64px;padding:11px 8px;border-radius:10px;background:${background};text-align:center"><div style="font-size:21px;font-weight:700;color:${color}">${escapeHtml(value)}</div><div style="margin-top:3px;font-size:10px;line-height:14px;color:#526176">${escapeHtml(label)}</div></div></td>`;
}

function typeColors(type: string) {
  if (type === "BOM") return { background: "#feecec", color: "#b42318" };
  if (type === "Stock Request") return { background: "#e8f2ff", color: "#0b5eb5" };
  return { background: "#e8f8ef", color: "#087443" };
}

function urgencyFor(date: string): ReminderRow["urgency"] {
  if (!date) return "normal";
  const days = daysFromToday(date);
  return days < 0 ? "overdue" : days <= 7 ? "urgent" : "normal";
}

function urgencyRank(value: ReminderRow["urgency"]) { return value === "overdue" ? 0 : value === "urgent" ? 1 : 2; }

function urgencyLabel(urgency: ReminderRow["urgency"], date: string) {
  if (!date) return { text: "Date not set", background: "#eef2f6", color: "#526176" };
  const days = daysFromToday(date);
  if (urgency === "overdue") return { text: `${Math.abs(days)}d overdue`, background: "#fff0f0", color: "#ba1a1a" };
  if (days === 0) return { text: "Due today", background: "#fff8e6", color: "#9a6500" };
  if (urgency === "urgent") return { text: `Due in ${days}d`, background: "#fff8e6", color: "#9a6500" };
  return { text: displayDate(date), background: "#eef6ff", color: "#0b5eb5" };
}

function daysFromToday(date: string) {
  const target = Date.parse(`${date}T00:00:00Z`);
  const today = Date.parse(`${uaeDate()}T00:00:00Z`);
  return Number.isFinite(target) ? Math.round((target - today) / 86_400_000) : 9999;
}

function uaeDate() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function displayDate(date: string) {
  if (!date) return "Not set";
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? "Not set" : new Intl.DateTimeFormat("en-AE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-AE", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dubai", timeZoneName: "short" }).format(date);
}

function reminderRecipient() {
  const value = env.REMINDER_EMAIL_RECIPIENT?.trim().toLowerCase() || "admin@example.com";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value) ? value : "admin@example.com";
}

function clean(value: unknown, limit: number) { return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, limit); }
function escapeHtml(value: unknown) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character); }
function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow" } }); }
