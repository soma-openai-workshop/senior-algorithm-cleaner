import 'server-only'

const secretKeyPattern = /token|secret|authorization|cookie|password|codeVerifier|subscriptionId/i

function redact(value: unknown, key = '', seen = new WeakSet<object>()): unknown {
  if (secretKeyPattern.test(key)) return '[REDACTED]'
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[CIRCULAR]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((entry) => redact(entry, '', seen))
  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redact(entryValue, entryKey, seen),
    ]),
  )
}

export function safeLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const safeFields = redact(fields) as Record<string, unknown>
  const payload = JSON.stringify({ level, event, ...safeFields })
  if (level === 'error') console.error(payload)
  else if (level === 'warn') console.warn(payload)
  else console.info(payload)
}

export const redactForTest = redact
