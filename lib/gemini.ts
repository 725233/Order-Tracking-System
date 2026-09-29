import { env } from "cloudflare:workers";

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType: string; data: string };
};

type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

type GeminiTool = {
  url_context?: Record<string, never>;
};

type GeminiGenerationConfig = {
  responseMimeType?: "application/json" | "text/plain";
  temperature?: number;
};

export type GeminiGenerateRequest = {
  contents: GeminiContent[];
  tools?: GeminiTool[];
  generationConfig?: GeminiGenerationConfig;
};

export type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export function hasGeminiConnection() {
  const hasGateway = Boolean(env.GEMINI_GATEWAY_URL?.trim() && env.GEMINI_GATEWAY_SECRET?.trim());
  const hasVertex = Boolean(env.VERTEX_API_KEY?.trim() && env.GOOGLE_CLOUD_PROJECT?.trim());
  return hasGateway || hasVertex || Boolean(env.GEMINI_API_KEY?.trim());
}

export function geminiResponseText(result: GeminiGenerateResponse) {
  return result.candidates
    ?.flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim() || "";
}

export function isGeminiLocationError(message: string) {
  return /location.+not supported|not available in your current location/i.test(message);
}

export async function generateGeminiContent(request: GeminiGenerateRequest, signal?: AbortSignal) {
  const model = env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  const gatewayUrl = env.GEMINI_GATEWAY_URL?.trim().replace(/\/+$/, "");
  const gatewaySecret = env.GEMINI_GATEWAY_SECRET?.trim();
  const vertexKey = env.VERTEX_API_KEY?.trim();
  const project = env.GOOGLE_CLOUD_PROJECT?.trim();
  const developerKey = env.GEMINI_API_KEY?.trim();

  let endpoint: string;
  let provider: "gateway" | "vertex" | "developer";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let body: GeminiGenerateRequest | (GeminiGenerateRequest & { model: string });

  if (gatewayUrl && gatewaySecret) {
    let parsedGatewayUrl: URL;
    try { parsedGatewayUrl = new URL(gatewayUrl); }
    catch { throw new Error("The Gemini gateway URL is invalid."); }
    if (parsedGatewayUrl.protocol !== "https:") throw new Error("The Gemini gateway must use HTTPS.");
    endpoint = parsedGatewayUrl.toString();
    headers["x-orderflow-gateway-secret"] = gatewaySecret;
    body = { model, ...request };
    provider = "gateway";
  } else if (vertexKey && project) {
    endpoint = `https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(project)}/locations/global/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
    headers["x-goog-api-key"] = vertexKey;
    body = request;
    provider = "vertex";
  } else if (developerKey) {
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    headers["x-goog-api-key"] = developerKey;
    body = request;
    provider = "developer";
  } else {
    throw new Error("Gemini is not connected.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json() as GeminiGenerateResponse;
  return { response, result, provider };
}
