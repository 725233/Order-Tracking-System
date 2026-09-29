declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    APP_BASE_URL?: string;
    COMPANY_EMAIL_DOMAIN?: string;
    GEMINI_API_KEY?: string;
    GEMINI_GATEWAY_SECRET?: string;
    GEMINI_GATEWAY_URL?: string;
    GEMINI_MODEL?: string;
    GOOGLE_CLOUD_PROJECT?: string;
    VERTEX_API_KEY?: string;
    GOOGLE_SHEETS_WEBHOOK_URL?: string;
    GOOGLE_SHEETS_SYNC_SECRET?: string;
    ORDER_ADMIN_EMAILS?: string;
    REMINDER_AUTOMATION_TOKEN?: string;
    REMINDER_EMAIL_RECIPIENT?: string;
  }
}
