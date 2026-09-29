import { asc, eq, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { appUsers } from "../../../../db/schema";
import { configuredAdminEmails, departmentRoles, requireAdministrator } from "../../../../lib/access";

function cleanEmail(value: unknown) { return String(value ?? "").trim().toLowerCase().slice(0, 320); }
function cleanName(value: unknown) { return String(value ?? "").trim().slice(0, 160); }
function cleanRoles(value: unknown) {
  const values = Array.isArray(value) ? value.map(String) : [];
  return [...new Set(values.filter((role) => departmentRoles.includes(role as typeof departmentRoles[number])))];
}
function companyEmailDomain() {
  const value = env.COMPANY_EMAIL_DOMAIN?.trim().toLowerCase() || "example.com";
  return /^[a-z0-9.-]+$/.test(value) ? value : "example.com";
}
function validCompanyEmail(email: string) {
  const separator = email.lastIndexOf("@");
  return separator > 0 && email.slice(separator + 1).toLowerCase() === companyEmailDomain();
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdministrator(request);
    if (auth.error) return auth.error;
    const db = getDb();
    const rows = await db.select().from(appUsers).orderBy(asc(appUsers.email));
    const configured = configuredAdminEmails();
    const users = rows.map((user) => ({ ...user, roles: cleanRoles(user.roles.split(",")), configuredAdmin: configured.includes(user.email) }));
    for (const email of configured) if (!users.some((user) => user.email === email)) users.unshift({ email, name: "Configured administrator", roles: [...departmentRoles], isAdmin: true, active: true, createdAt: "", updatedAt: "", configuredAdmin: true });
    return Response.json({ users, availableRoles: departmentRoles });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load users." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdministrator(request);
    if (auth.error) return auth.error;
    const payload = await request.json() as Record<string, unknown>;
    const email = cleanEmail(payload.email);
    const name = cleanName(payload.name);
    const isAdmin = payload.isAdmin === true;
    const roles = isAdmin ? [...departmentRoles] : cleanRoles(payload.roles);
    if (!validCompanyEmail(email)) return Response.json({ error: `Enter a valid @${companyEmailDomain()} email.` }, { status: 400 });
    if (!isAdmin && !roles.length) return Response.json({ error: "Assign at least one department role." }, { status: 400 });
    const db = getDb();
    const [existing] = await db.select().from(appUsers).where(eq(appUsers.email, email)).limit(1);
    if (existing) await db.update(appUsers).set({ name, roles: roles.join(","), isAdmin, active: true, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(appUsers.email, email));
    else await db.insert(appUsers).values({ email, name, roles: roles.join(","), isAdmin, active: true });
    return Response.json({ saved: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save user." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdministrator(request);
    if (auth.error) return auth.error;
    const payload = await request.json() as Record<string, unknown>;
    const email = cleanEmail(payload.email);
    if (!validCompanyEmail(email)) return Response.json({ error: "Invalid user email." }, { status: 400 });
    const isAdmin = payload.isAdmin === true;
    const roles = isAdmin ? [...departmentRoles] : cleanRoles(payload.roles);
    if (!isAdmin && !roles.length) return Response.json({ error: "Assign at least one department role." }, { status: 400 });
    const db = getDb();
    const [user] = await db.select().from(appUsers).where(eq(appUsers.email, email)).limit(1);
    if (!user) return Response.json({ error: "User not found." }, { status: 404 });
    await db.update(appUsers).set({ name: cleanName(payload.name), roles: roles.join(","), isAdmin, active: payload.active !== false, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(appUsers.email, email));
    return Response.json({ saved: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update user." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdministrator(request);
    if (auth.error) return auth.error;
    const email = cleanEmail(new URL(request.url).searchParams.get("email"));
    if (!email) return Response.json({ error: "User email is required." }, { status: 400 });
    if (configuredAdminEmails().includes(email)) return Response.json({ error: "A configured administrator cannot be removed here." }, { status: 409 });
    if (email === auth.access.email) return Response.json({ error: "You cannot remove your own administrator access." }, { status: 409 });
    const db = getDb();
    const [existing] = await db.select().from(appUsers).where(eq(appUsers.email, email)).limit(1);
    if (existing) await db.update(appUsers).set({ active: false, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(appUsers.email, email));
    else await db.insert(appUsers).values({ email, name: "", roles: "", isAdmin: false, active: false });
    return Response.json({ removed: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not remove user." }, { status: 500 });
  }
}
