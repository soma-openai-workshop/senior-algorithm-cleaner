import 'server-only'
import { z } from 'zod'

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_BASE_URL: z.url().refine((value) => !value.endsWith('/'), 'APP_BASE_URL must not end with /'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(1)
    .refine((value) => {
      try {
        return Buffer.from(value, 'base64').byteLength === 32
      } catch {
        return false
      }
    }, 'TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes'),
  DATABASE_PATH: z.string().min(1).default('./data/senior-algorithm-cleaner.db'),
  ANALYSIS_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(24),
  GEMINI_JUDGE_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_JUDGE_MODEL: z.string().min(1).default('gemini-3.7-flash'),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

let cachedEnv: ServerEnv | undefined

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source)
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`서버 환경 설정이 올바르지 않습니다: ${keys}`)
  }
  return result.data
}

export function getServerEnv(): ServerEnv {
  cachedEnv ??= parseServerEnv(process.env)
  return cachedEnv
}

export function resetServerEnvForTests(): void {
  cachedEnv = undefined
}
