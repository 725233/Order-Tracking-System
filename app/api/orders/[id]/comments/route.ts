import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { orderComments, orders } from "../../../../../db/schema";
import { requireAppAccess } from "../../../../../lib/access";

function displayName(request: Request, email: string) {
  const encoded = request.headers.get("oai-authenticated-user-full-name")?.trim() || "";
  if (encoded && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { return decodeURIComponent(encoded); } catch { /* Fall back to the email name. */ }
  }
  return email.split("@")[0]?.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Signed-in user";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAppAccess(request);
    if (auth.error) return auth.error;
    const authorUserId = request.headers.get("oai-authenticated-user-id")?.trim() || "";
    const authorEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || "";
    if (!authorUserId || !authorEmail) return Response.json({ error: "Please sign in before adding a comment." }, { status: 401 });

    const { id: orderId } = await context.params;
    const payload = await request.json() as { body?: unknown };
    const body = String(payload.body ?? "").trim();
    if (!body) return Response.json({ error: "Write a comment before posting." }, { status: 400 });
    if (body.length > 2000) return Response.json({ error: "Keep the comment under 2,000 characters." }, { status: 400 });

    const db = getDb();
    const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });

    const comment = {
      id: crypto.randomUUID(), orderId, body, authorUserId, authorEmail,
      authorName: auth.access.name || displayName(request, authorEmail), createdAt: new Date().toISOString(),
    };
    await db.insert(orderComments).values(comment);
    const visibleComment = { ...comment, authorUserId: undefined };
    return Response.json({ comment: visibleComment }, { status: 201 });
  } catch (error) {
    console.error("Order comment failed", error);
    return Response.json({ error: "The comment could not be posted. Please try again." }, { status: 500 });
  }
}
