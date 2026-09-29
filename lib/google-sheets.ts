import { env } from "cloudflare:workers";

type Activity = {
  action: string;
  department: string;
  itemId?: string;
  itemDescription?: string;
  summary: string;
};

export async function syncOrderToGoogleSheets(order: unknown, items: unknown[], activity: Activity) {
  const webhookUrl = env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
  const secret = env.GOOGLE_SHEETS_SYNC_SECRET?.trim();
  if (!webhookUrl || !secret) return;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(webhookUrl)) {
    console.error("Google Sheets sync skipped: invalid webhook URL");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret, order: { ...(order as object), items }, activity }),
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) console.error("Google Sheets sync failed", response.status);
  } catch (error) {
    console.error("Google Sheets sync error", error instanceof Error ? error.message : "Unknown error");
  } finally {
    clearTimeout(timeout);
  }
}
