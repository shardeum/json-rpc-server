import Database from 'better-sqlite3'
import fs from 'fs'

export let db: Database.Database

export let statements: {[name: string]:Database.Statement} = {}

function init() {
  /* eslint-disable security/detect-non-literal-fs-filename */
  const dir = './log'
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
  db = new Database(`${dir}/log.sqlite3`)
  db.pragma('journal_mode = WAL')
  console.log('Database initialized.')
  /* eslint-enable security/detect-non-literal-fs-filename */
}

function createTables() {
  db.exec(
    'CREATE TABLE IF NOT EXISTS transactions ' +
      '(`id` INTEGER PRIMARY KEY AUTOINCREMENT, `hash` VARCHAR NOT NULL UNIQUE, `type` VARCHAR, `to` VARCHAR, `from` VARCHAR, `injected` BOOLEAN, `accepted` NUMBER NOT NULL, `reason` VARCHAR, `ip` VARCHAR, `timestamp` BIGINT, `nodeUrl` VARCHAR)'
  )

  db.exec(
    'CREATE TABLE IF NOT EXISTS interface_stats ' +
      '(`id` INTEGER PRIMARY KEY AUTOINCREMENT, `api_name` VARCHAR NOT NULL, `tfinal` BIGINT, `timestamp` BIGINT, `nodeUrl` VARCHAR, `success` boolean, `reason` VARCHAR, `hash` VARCHAR)'
  )

  db.exec(
    'CREATE TABLE IF NOT EXISTS gas_estimations ' +
      '(`contract_address` VARCHAR, `function_signature` VARCHAR, `gasEstimate` VARCHAR, `timestamp` BIGINT, ' +
      'PRIMARY KEY (`contract_address`, `function_signature`))'
  )
}

export function createPreparedStatements() {
  statements['insertInterfaceStat'] = db.prepare('INSERT INTO interface_stats VALUES (NULL, $api_name, $tfinal, $timestamp, $nodeUrl, $success, $reason, $hash)')
  statements['getInterfaceStatCounts'] = db.prepare('SELECT api_name, COUNT(api_name) FROM interface_stats GROUP BY api_name ORDER BY COUNT(api_name) DESC')
}

export function setupDatabase() {
  init()
  createTables()
  createPreparedStatements()
}
