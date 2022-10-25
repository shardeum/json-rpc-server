import Database from 'better-sqlite3';
import fs from 'fs';

export let db: any;

async function init() {
    const dir = './log'
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }
  db = new Database(`${dir}/log.sqlite3`);
    await db.pragma('journal_mode = WAL');
  console.log('Database initialized.');
}

async function createTable(){
  await db.exec(
    'CREATE TABLE IF NOT EXISTS transactions ' +
    '(`id` INTEGER PRIMARY KEY AUTOINCREMENT, `hash` VARCHAR NOT NULL UNIQUE, `type` VARCHAR, `to` VARCHAR, `from` VARCHAR, `injected` BOOLEAN, `accepted` NUMBER NOT NULL,`reason` VARCHAR, `ip` VARCHAR, `timestamp` BIGINT)'
  );
};

export async function setupDatabase(){
    await init()
    await createTable()
}

