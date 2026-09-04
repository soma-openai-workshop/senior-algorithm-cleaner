import { readSession, writeSession } from "./session";

const PORTABILITY_BASE = "https://dataportability.googleapis.com/v1";

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

export function configuration() {
  return {
    clientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    clientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    apiKey: Boolean(process.env.GOOGLE_API_KEY),
    sessionSecret: Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32),
    baseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  };
}

export function callbackUrl() {
  return `${configuration().baseUrl}/api/auth/portability/callback`;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: callbackUrl(),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  return response.json() as Promise<TokenResponse>;
}

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const body = (await response.json()) as TokenResponse;
  if (!response.ok || !body.access_token) throw new Error(body.error_description ?? body.error ?? "Token refresh failed");
  return body;
}

export async function accessToken() {
  const session = await readSession();
  if (!session) throw new Error("Data Portability OAuth connection is required");
  if (session.expiresAt > Date.now() + 60_000) return session.accessToken;
  if (!session.refreshToken) throw new Error("OAuth access token expired; reconnect the account");

  const refreshed = await refreshAccessToken(session.refreshToken);
  await writeSession({
    accessToken: refreshed.access_token!,
    refreshToken: session.refreshToken,
    expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
    scope: refreshed.scope ?? session.scope,
  });
  return refreshed.access_token!;
}

export async function portabilityFetch(path: string, init?: RequestInit) {
  const url = new URL(`${PORTABILITY_BASE}${path}`);
  if (process.env.GOOGLE_API_KEY) url.searchParams.set("key", process.env.GOOGLE_API_KEY);
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json; charset=utf-8",
      ...init?.headers,
    },
    cache: "no-store",
  });
}

export async function responsePayload(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}
