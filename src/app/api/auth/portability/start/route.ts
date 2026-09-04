import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { callbackUrl, configuration } from "@/lib/google";

const SCOPE = "https://www.googleapis.com/auth/dataportability.myactivity.youtube";

export async function GET() {
  const config = configuration();
  if (!config.clientId || !config.clientSecret || !config.sessionSecret) {
    return NextResponse.json({ error: "OAuth environment variables are incomplete", config }, { status: 500 });
  }

  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("portability_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  }).toString();

  return NextResponse.redirect(url);
}
