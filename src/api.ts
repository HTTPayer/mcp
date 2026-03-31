const BASE = "https://api.httpayer.com";
const BALANCE_PATH = "/v1/credits/balance";
const ALLOWED_HOST = "api.httpayer.com";

function assertHttpayerHost(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (host !== ALLOWED_HOST) {
    throw new Error(
      `API key can only be used with ${ALLOWED_HOST}. Refusing to send credentials to: ${host}`
    );
  }
}

export interface ProxyOptions {
  method?: string;
  json?: unknown;
  data?: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface ProxyResult {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  webhook_id?: string;
}

async function apiRequest(
  apiKey: string,
  path: string,
  method = "GET",
  body?: unknown
): Promise<unknown> {
  const url = `${BASE}${path}`;
  assertHttpayerHost(url);

  const res = await fetch(url, {
    method,
    headers: {
      "x-api-key": apiKey,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTPayer ${res.status}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function getBalance(apiKey: string) {
  return apiRequest(apiKey, BALANCE_PATH);
}

export function getLimits(apiKey: string) {
  return apiRequest(apiKey, "/limits");
}

export function getWebhookStatus(apiKey: string, webhookId: string) {
  return apiRequest(apiKey, `/webhooks/${webhookId}`);
}

export async function proxyFetch(
  apiKey: string,
  url: string,
  options: ProxyOptions = {},
  simulate = false
): Promise<ProxyResult> {
  const endpoint = simulate ? "/proxy/sim" : "/proxy";
  const proxyUrl = `${BASE}${endpoint}`;
  assertHttpayerHost(proxyUrl);

  const payload: Record<string, unknown> = {
    api_url: url,
    method: (options.method ?? "GET").toUpperCase(),
  };
  if (options.json !== undefined) payload.json = options.json;
  if (options.data !== undefined) payload.data = options.data;
  if (options.params) payload.params = options.params;
  if (options.headers) payload.headers = options.headers;
  if (options.timeout) payload.timeout = options.timeout;

  const res = await fetch(proxyUrl, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  const result: ProxyResult = {
    status: res.status,
    body,
    headers: Object.fromEntries(res.headers),
  };

  if (
    res.status === 502 &&
    body !== null &&
    typeof body === "object" &&
    "webhook_id" in body
  ) {
    result.webhook_id = (body as { webhook_id: string }).webhook_id;
  }

  return result;
}
