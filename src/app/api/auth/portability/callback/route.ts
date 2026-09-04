import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { configuration, exchangeCode } from "@/lib/google";
import { writeSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const jar = await cookies();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");
  const expectedState = jar.get("portability_oauth_state")?.value;
  jar.delete("portability_oauth_state");

  if (oauthError) return NextResponse.redirect(new URL(`/?oauth=error&detail=${encodeURIComponent(oauthError)}`, configuration().baseUrl));
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/?oauth=invalid_state", configuration().baseUrl));
  }

  const token = await exchangeCode(code);
  if (!token.access_token) {
    const detail = token.error_description ?? token.error ?? "token_exchange_failed";
    return NextResponse.redirect(new URL(`/?oauth=error&detail=${encodeURIComponent(detail)}`, configuration().baseUrl));
  }

  await writeSession({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
    scope: token.scope ?? "",
  });

  return NextResponse.redirect(new URL("/?oauth=connected", configuration().baseUrl));
}
