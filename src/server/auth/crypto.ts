import 'server-only'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { getServerEnv } from '@/server/env'

export type EncryptedSecret = {
  ciphertext: Buffer
  iv: Buffer
  authTag: Buffer
}

export function randomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url')
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}

export function tokenHashMatches(token: string, expected: Buffer): boolean {
  const actual = hashToken(token)
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected)
}

export function encryptSecret(plaintext: string, key = encryptionKey()): EncryptedSecret {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return { ciphertext, iv, authTag: cipher.getAuthTag() }
}

export function decryptSecret(secret: EncryptedSecret, key = encryptionKey()): string {
  const decipher = createDecipheriv('aes-256-gcm', key, secret.iv)
  decipher.setAuthTag(secret.authTag)
  return Buffer.concat([decipher.update(secret.ciphertext), decipher.final()]).toString('utf8')
}

function encryptionKey(): Buffer {
  return Buffer.from(getServerEnv().TOKEN_ENCRYPTION_KEY, 'base64')
}
