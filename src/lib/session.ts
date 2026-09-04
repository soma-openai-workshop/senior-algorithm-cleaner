import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

const COOKIE_NAME = "portability_smoke_session";

export type PortabilitySession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
};

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(value);
}

export async function readSession(): Promise<PortabilitySession | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.accessToken !== "string" || typeof payload.expiresAt !== "number") return null;
    return {
      accessToken: payload.accessToken,
      refreshToken: typeof payload.refreshToken === "string" ? payload.refreshToken : undefined,
      expiresAt: payload.expiresAt,
      scope: typeof payload.scope === "string" ? payload.scope : "",
    };
  } catch {
    return null;
  }
}

export async function writeSession(session: PortabilitySession) {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE_NAME);
}
