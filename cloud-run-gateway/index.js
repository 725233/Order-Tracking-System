import { http } from "@google-cloud/functions-framework";
import { GoogleAuth } from "google-auth-library";
import { createHash, timingSafeEqual } from "node:crypto";

const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  "";
const LOCATION = "global";
const DEFAULT_MODEL = "gemini-3.8-flash";
const MAX_BODY_BYTES = 16 * 1024 * 1024;
const ALLOWED_MODELS = new Set([
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
]);

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function secretsMatch(provided, expected) {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

function toolsAreAllowed(tools) {
  if (tools === undefined) return true;
  if (!Array.isArray(tools) || tools.length > 1) return false;

  return tools.every((tool) => {
    const toolObject = asPlainObject(tool);
    if (!toolObject) return false;

    const keys = Object.keys(toolObject);
    return (
      keys.length === 1 &&
      keys[0] === "url_context" &&
      asPlainObject(toolObject.url_context) !== null
    );
  });
}

function sendError(res, status, message) {
  return res.status(status).json({ error: { message } });
}

http("geminiGateway", async (req, res) => {
  res.set("Cache-Control", "no-store");

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      service: "orderflow-gemini-gateway",
    });
  }

  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed.");
  }

  if (!PROJECT_ID) {
    return sendError(res, 503, "Google Cloud project is not configured.");
  }

  const expectedSecret = process.env.GATEWAY_SECRET || "";
  const providedSecret = String(
    req.get("x-orderflow-gateway-secret") || "",
  );

  if (!expectedSecret) {
    return sendError(res, 503, "Gateway secret is not configured.");
  }

  if (
    !providedSecret ||
    !secretsMatch(providedSecret, expectedSecret)
  ) {
    return sendError(res, 401, "Unauthorized.");
  }

  const declaredLength = Number(req.get("content-length") || 0);
  const parsedLength = req.rawBody?.length || 0;
  if (
    (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) ||
    parsedLength > MAX_BODY_BYTES
  ) {
    return sendError(res, 413, "Request is too large.");
  }

  const body = asPlainObject(req.body);
  if (!body) {
    return sendError(res, 400, "A JSON request body is required.");
  }

  const model = String(body.model || DEFAULT_MODEL).trim();
  if (!ALLOWED_MODELS.has(model)) {
    return sendError(res, 400, "Unsupported model.");
  }

  if (
    !Array.isArray(body.contents) ||
    body.contents.length < 1 ||
    body.contents.length > 20
  ) {
    return sendError(res, 400, "Invalid Gemini contents.");
  }

  if (!toolsAreAllowed(body.tools)) {
    return sendError(res, 400, "Unsupported Gemini tool.");
  }

  const payload = { contents: body.contents };

  if (body.tools !== undefined) {
    payload.tools = body.tools;
  }

  const generationConfig = asPlainObject(body.generationConfig);
  if (generationConfig) {
    payload.generationConfig = generationConfig;
  }

  const systemInstruction = asPlainObject(body.systemInstruction);
  if (systemInstruction) {
    payload.systemInstruction = systemInstruction;
  }

  const endpoint =
    `https://aiplatform.googleapis.com/v1beta1/projects/` +
    `${encodeURIComponent(PROJECT_ID)}/locations/${LOCATION}/publishers/google/` +
    `models/${encodeURIComponent(model)}:generateContent`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 70_000);

  try {
    const client = await auth.getClient();
    const tokenResult = await client.getAccessToken();
    const accessToken =
      typeof tokenResult === "string" ? tokenResult : tokenResult?.token;

    if (!accessToken) {
      throw new Error("Google access token was unavailable.");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let result;

    try {
      result = JSON.parse(responseText);
    } catch {
      result = {
        error: {
          message: "Google returned an unreadable response.",
        },
      };
    }

    if (!response.ok) {
      console.error(
        "Gemini request failed",
        response.status,
        result?.error?.status || "unknown",
      );
    }

    return res.status(response.status).json(result);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    console.error(
      "Gemini gateway failed",
      error instanceof Error ? error.name : "unknown",
    );
    return sendError(
      res,
      timedOut ? 504 : 502,
      timedOut
        ? "Gemini took too long to respond. Please try again."
        : "The Gemini gateway could not complete the request.",
    );
  } finally {
    clearTimeout(timeout);
  }
});
