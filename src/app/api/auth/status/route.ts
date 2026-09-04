import { NextResponse } from "next/server";
import { configuration } from "@/lib/google";
import { readSession } from "@/lib/session";

export async function GET() {
  const session = await readSession();
  return NextResponse.json({
    configured: configuration(),
    connected: Boolean(session),
    tokenExpiresAt: session ? new Date(session.expiresAt).toISOString() : null,
    grantedScope: session?.scope ?? null,
  });
}
