import Database from 'better-sqlite3'
import fs from 'fs'

/**
 * This module provides functionality for initializing and setting up a SQLite database for storing data.
 * It exports functions for initializing the database, creating tables, and setting up the database.
 */

export let db: any

/**
 * Initializes the SQLite database by creating the necessary directory and database file.
 */
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

/**
 * Creates the necessary tables in the SQLite database.
 */
async function createTables() {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS transactions ' +
      '(`id` INTEGER PRIMARY KEY AUTOINCREMENT, `hash` VARCHAR NOT NULL UNIQUE, `type` VARCHAR, `to` VARCHAR, `from` VARCHAR, `injected` BOOLEAN, `accepted` NUMBER NOT NULL,`reason` VARCHAR, `ip` VARCHAR, `timestamp` BIGINT, `nodeUrl` VARCHAR)'
  )
  await db.exec(
    'CREATE TABLE IF NOT EXISTS interface_stats ' +
      '(`id` INTEGER PRIMARY KEY AUTOINCREMENT, `api_name` VARCHAR NOT NULL, `tfinal` BIGINT, `timestamp` BIGINT, `nodeUrl` VARCHAR, `success` boolean, `reason` VARCHAR, `hash` VARCHAR)'
  )
}

/**
 * Sets up the SQLite database by initializing it and creating the necessary tables.
 */
export async function setupDatabase() {
  await init()
  await createTables()
}
