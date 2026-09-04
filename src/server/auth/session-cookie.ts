export const SESSION_COOKIE_NAME = 'sac_session'

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
    priority: 'high' as const,
  }
}

export function expiredSessionCookieOptions() {
  return { ...sessionCookieOptions(new Date(0)), maxAge: 0 }
}
