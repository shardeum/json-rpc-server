import Database from 'better-sqlite3'
import fs from 'fs'

export let db: any

async function init() {
  /* eslint-disable security/detect-non-literal-fs-filename */
  const dir = './log'
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
  db = new Database(`${dir}/log.sqlite3`)
  await db.pragma('journal_mode = WAL')
  console.log('Database initialized.')
  /* eslint-enable security/detect-non-literal-fs-filename */
}

async function createTables() {
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
      '(`contract_address` VARCHAR, `function_signature` VARCHAR, `gasUsed` VARCHAR, `gasRefund` VARCHAR, `timestamp` BIGINT, ' +
      'PRIMARY KEY (`contract_address`, `function_signature`))'
  )
}

export async function setupDatabase() {
  await init()
  await createTables()
}
