import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../db";
import { appUsers } from "../db/schema";

export const departmentRoles = ["All Orders Status", "Sales Coordinator", "Procurement Manager", "Procurement", "Management Approval", "Accounts", "Logistics"] as const;
export type DepartmentRole = typeof departmentRoles[number];

export function configuredAdminEmails() {
  return (env.ORDER_ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

export function requestIdentity(request: Request) {
  return {
    userId: request.headers.get("oai-authenticated-user-id")?.trim() || "",
    email: request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || "",
  };
}

export async function getAppAccess(request: Request) {
  const identity = requestIdentity(request);
  if (!identity.userId || !identity.email) return { ...identity, authenticated: false, active: false, isAdmin: false, roles: [] as DepartmentRole[], name: "", managed: false };
  const configuredAdmin = configuredAdminEmails().includes(identity.email);
  const db = getDb();
  const [user] = await db.select().from(appUsers).where(eq(appUsers.email, identity.email)).limit(1);
  const roles = user ? user.roles.split(",").map((role) => role.trim()).filter((role): role is DepartmentRole => departmentRoles.includes(role as DepartmentRole)) : [];
  return {
    ...identity,
    authenticated: true,
    active: configuredAdmin || Boolean(user?.active),
    isAdmin: configuredAdmin || Boolean(user?.isAdmin),
    roles: configuredAdmin || user?.isAdmin ? [...departmentRoles] : roles,
    name: user?.name?.trim() || "",
    managed: Boolean(user),
  };
}

export async function requireAppAccess(request: Request, allowedRoles?: DepartmentRole[]) {
  const access = await getAppAccess(request);
  if (!access.authenticated) return { access, error: Response.json({ error: "Please sign in to continue." }, { status: 401 }) };
  if (!access.active) return { access, error: Response.json({ error: "Your Order Tracking access has been removed. Contact an administrator." }, { status: 403 }) };
  if (allowedRoles?.length && !access.isAdmin && !allowedRoles.some((role) => access.roles.includes(role))) {
    return { access, error: Response.json({ error: "Your assigned role does not allow this action." }, { status: 403 }) };
  }
  return { access, error: null };
}

export async function requireAdministrator(request: Request) {
  const result = await requireAppAccess(request);
  if (result.error) return result;
  if (!result.access.isAdmin) return { ...result, error: Response.json({ error: "Administrator access is required." }, { status: 403 }) };
  return result;
}
