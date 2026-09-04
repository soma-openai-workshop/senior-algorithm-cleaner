import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import type { AppDatabase } from '@/server/db/client'
import { openDatabase } from '@/server/db/client'

export function temporaryDatabase(): { database: AppDatabase; cleanup: () => void } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sac-test-'))
  const database = openDatabase(path.join(directory, 'test.db'))
  return {
    database,
    cleanup: () => {
      database.close()
      fs.rmSync(directory, { recursive: true, force: true })
    },
  }
}
