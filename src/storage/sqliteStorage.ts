import Database from 'better-sqlite3'
import fs from 'fs'
import logger from '../config/logger'

export let db: Database.Database

async function init(): Promise<void> {
  /* eslint-disable security/detect-non-literal-fs-filename */
  const dir = './log'
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
  db = new Database(`${dir}/log.sqlite3`)
  await db.pragma('journal_mode = WAL')
  logger.info('Database initialized.')
  /* eslint-enable security/detect-non-literal-fs-filename */
}

async function createTables(): Promise<void> {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS transactions ' +
      '(`id` INTEGER PRIMARY KEY AUTOINCREMENT, `hash` VARCHAR NOT NULL UNIQUE, `type` VARCHAR, `to` VARCHAR, `from` VARCHAR, `injected` BOOLEAN, `accepted` NUMBER NOT NULL, `reason` VARCHAR, `ip` VARCHAR, `timestamp` BIGINT, `nodeUrl` VARCHAR)'
  )

  await db.exec(
    'CREATE TABLE IF NOT EXISTS interface_stats ' +
      '(`id` INTEGER PRIMARY KEY AUTOINCREMENT, `api_name` VARCHAR NOT NULL, `tfinal` BIGINT, `timestamp` BIGINT, `nodeUrl` VARCHAR, `success` boolean, `reason` VARCHAR, `hash` VARCHAR)'
  )

  await db.exec(
    'CREATE TABLE IF NOT EXISTS gas_estimations ' +
      '(`contract_address` VARCHAR, `function_signature` VARCHAR, `gasEstimate` VARCHAR, `timestamp` BIGINT, ' +
      'PRIMARY KEY (`contract_address`, `function_signature`))'
  )
}

export function checkDatabaseHealth(): boolean {
  try {
    // Run a simple SELECT to check if the database is responding
    db.prepare('SELECT 1').get()
    return true
  } catch (error) {
    logger.error('Database health check failed', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined })
    return false
  }
}

export async function setupDatabase(): Promise<void> {
  await init()
  await createTables()
}
