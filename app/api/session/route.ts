import { getAppAccess } from "../../../lib/access";

function decodeName(request: Request) {
  const encoded = request.headers.get("oai-authenticated-user-full-name")?.trim() || "";
  if (!encoded || request.headers.get("oai-authenticated-user-full-name-encoding") !== "percent-encoded-utf-8") return "";
  try { return decodeURIComponent(encoded); } catch { return ""; }
}

export async function GET(request: Request) {
  const access = await getAppAccess(request);
  if (!access.authenticated) return Response.json({ error: "This account is not signed in." }, { status: 401 });
  if (!access.active) return Response.json({ error: `${access.email} is not currently approved. Ask an administrator to add this exact email.`, email: access.email }, { status: 403 });
  return Response.json({ email: access.email, name: access.name || decodeName(request) || access.email.split("@")[0], isAdmin: access.isAdmin, roles: access.roles });
}

export async function POST(request: Request) {
  try {
    const access = await getAppAccess(request);
    if (!access.authenticated) return Response.json({ error: "This account is not signed in or approved for this dashboard." }, { status: 401 });
    if (!access.active) return Response.json({ error: `${access.email} is not currently approved. Ask an administrator to add this exact email.`, email: access.email }, { status: 403 });

    const body = await request.json() as { email?: unknown };
    const enteredEmail = String(body.email ?? "").trim().toLowerCase().slice(0, 320);
    if (!enteredEmail) return Response.json({ error: "Enter your approved work email." }, { status: 400 });
    if (enteredEmail !== access.email) return Response.json({ error: "Use the same email address that was approved for this dashboard." }, { status: 403 });

    return Response.json({ email: access.email, name: access.name || decodeName(request) || access.email.split("@")[0], isAdmin: access.isAdmin, roles: access.roles });
  } catch {
    return Response.json({ error: "The email could not be verified. Please try again." }, { status: 500 });
  }
}
