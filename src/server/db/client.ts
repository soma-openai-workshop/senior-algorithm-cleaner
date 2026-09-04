import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { getServerEnv } from '@/server/env'

export type AppDatabase = Database.Database

type GlobalDatabase = typeof globalThis & { __sacDatabase?: AppDatabase }

const migrationFiles = [
  '001_oauth_collection.sql',
  '002_analysis_pipeline.sql',
  '003_unsubscribe_confirmations.sql',
  '004_factory_weighting.sql',
] as const

export function migrateDatabase(database: AppDatabase, migrationRoot = migrationDirectory()): void {
  database.pragma('foreign_keys = ON')
  database.pragma('journal_mode = WAL')
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const applied = database.prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
  const record = database.prepare(
    'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
  )

  const apply = database.transaction((version: number, sql: string) => {
    database.exec(sql)
    record.run(version, new Date().toISOString())
  })

  for (const [index, filename] of migrationFiles.entries()) {
    const version = index + 1
    if (applied.get(version)) continue
    apply(version, fs.readFileSync(path.join(migrationRoot, filename), 'utf8'))
  }
}

export function openDatabase(filename: string): AppDatabase {
  const resolved = path.resolve(filename)
  fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 })
  const database = new Database(resolved)
  migrateDatabase(database)
  return database
}

export function getDatabase(): AppDatabase {
  const globalDatabase = globalThis as GlobalDatabase
  globalDatabase.__sacDatabase ??= openDatabase(getServerEnv().DATABASE_PATH)
  return globalDatabase.__sacDatabase
}

export function transaction<T extends (...args: never[]) => unknown>(fn: T) {
  return getDatabase().transaction(fn)
}

function migrationDirectory(): string {
  return path.join(process.cwd(), 'src/server/db/migrations')
}
