import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) process.loadEnvFile(envPath)

const filename = path.resolve(process.env.DATABASE_PATH || './data/senior-algorithm-cleaner.db')
fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 })

const database = new Database(filename)
try {
  database.pragma('foreign_keys = ON')
  database.pragma('journal_mode = WAL')
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)
  const migrationPath = path.join(
    process.cwd(),
    'src/server/db/migrations/001_oauth_collection.sql',
  )
  if (!database.prepare('SELECT 1 FROM schema_migrations WHERE version = 1').get()) {
    database.transaction(() => {
      database.exec(fs.readFileSync(migrationPath, 'utf8'))
      database
        .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)')
        .run(new Date().toISOString())
    })()
  }
  console.info('Database migration complete.')
} finally {
  database.close()
}
