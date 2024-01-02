import { db } from '../storage/sqliteStorage'
import express from 'express'
export const router = express.Router()
import { CONFIG } from '../config'
import { debug_info } from '../logger'


/**
 * This file contains the implementation of the log routes for the JSON-RPC server.
 * It defines the routes for retrieving API statistics, cleaning the statistics table,
 * retrieving transactions, cleaning the transactions table, and controlling the
 * recording of transaction and interface statistics.
 * 
 * The routes include:
 * - /api-stats: Retrieves API statistics based on the provided filters.
 * - /cleanStatTable: Cleans the statistics table by deleting all entries.
 * - /txs: Retrieves transactions based on the provided filters.
 * - /cleanTxTable: Cleans the transactions table by deleting all entries.
 * - /startTxCapture: Enables the recording of transaction status.
 * - /stopTxCapture: Disables the recording of transaction status.
 * - /startRPCCapture: Enables the recording of interface statistics.
 * - /stopRPCCapture: Disables the recording of interface statistics.
 * - /status: Retrieves the current status of transaction and interface recording.
 */

const timeInputProcessor = (timestamp: string) => {
  const t = timestamp.includes('-') ? timestamp : parseInt(timestamp)
  return new Date(t).getTime()
}

/**
 * Represents the filters for querying SQL logs.
 * @property {string | number} [start] - The start date or timestamp of the logs.
 * @property {string | number} [end] - The end date or timestamp of the logs.
 * @property {number} [id] - The ID of the log.
 * @property {string} [hash] - The hash of the log.
 * @property {string} [to] - The recipient of the log.
 * @property {string} [from] - The sender of the log.
 * @property {string} [type] - The type of the log.
 * @property {string} [reason] - The reason for the log.
 * @property {boolean} [injected] - Indicates if the log was injected.
 * @property {number} [accepted] - The acceptance status of the log.
 * @property {boolean} [success] - Indicates if the log was successful.
 * @property {string} [api_name] - The API name associated with the log.
 * @property {string} [nodeUrl] - The URL of the node associated with the log.
 * @property {string} [ip] - The IP address associated with the log.
 */
type SQLFiltersParam = {
  start?: string | number, 
  end?: string | number, 
  id?: number, 
  hash?: string, 
  to?: string, 
  from?: string,
  type?: string,
  reason?: string, 
  injected?: boolean, 
  accepted?: number,
  success?: boolean, 
  api_name?: string, 
  nodeUrl?: string, 
  ip?: string 
}

/**
 * Prepares SQL filters based on the provided parameters.
 * 
 * @param {SQLFiltersParam} filters - The SQL filters to be applied.
 * @returns {string} - The SQL query string with the applied filters.
 */
const prepareSQLFilters = ({
  start, 
  end, 
  id, 
  hash, 
  to, 
  from,
  type,
  reason, 
  injected, 
  accepted,
  success, 
  api_name, 
  nodeUrl, 
  ip 
}:SQLFiltersParam) => {

  // add filters to the query string
  
  let sql = ''
  // if(start && end) {
  //   sql += `AND timestamp between ${start} AND ${end} `
  // }
  if(id){
    sql += `AND id = ${id} `
  }
  if(hash) {
    sql += `AND hash = ${hash} `
  }
  if(to){
    sql += `AND [to]=${to} `
  }
  if(from) {
    sql += `AND [from] = ${from} `
  }
  if(type) {
    sql += `AND [type] = ${type} `
  }
  if(reason){
    sql += `AND reason LIKE '%${reason}%' `
  }
  if(injected){
    sql += `AND injected = ${injected} `
  }
  if(accepted){
    sql += `AND accepted = ${accepted} `
  }
  if(success){
    sql += `AND success = ${success} `
  }
  if(api_name){
    sql += `AND api_name = ${api_name} `
  }
  if(nodeUrl){
    sql += `AND nodeUrl=${nodeUrl} `
  }
  if(ip){
    sql += `And ip = ${ip} `
  }
  return sql
}


/**
 * @route GET /log/api-stats
 */
router.route('/api-stats').get(async (req: any, res: any) => {
  try {

    const page = req.query.page || 0
    const max = req.query.max || 5000
    const cursor: number = page * max

    const start = req.query.start ? timeInputProcessor(req.query.start) : null
    const end = req.query.end ? timeInputProcessor(req.query.end) : null

    if(start && !end){
      // returns first entry
        const tx = db.prepare(`SELECT * FROM interface_stats WHERE timestamp>${start} LIMIT 1`).all()
        return res.json(tx[0]).status(200);
    }
    if(!start && end){
        // returns first entry
        const tx = db.prepare(`SELECT *
                                FROM interface_stats
                                WHERE ABS(timestamp - ${end}) = (
                                  SELECT MIN(ABS(timestamp - ${end}))
                                  FROM interface_stats
                                )
                                LIMIT 1 OFFSET 0;`).all()
        return res.json(tx[0]).status(200);
    }

    // gets SQL filters from the query string based on the provided parameters
      const sqlFilter = prepareSQLFilters({
          nodeUrl: req.query.nodeUrl,
          api_name: req.query.api_name,
          reason: req.query.reason,
          hash: req.query.hash,
          success: req.query.success
      })
    
    // creates the prefix of the SQL query string based on the provided parameters
    const sqlString = (sqlFilter == '') ?
        `SELECT * FROM interface_stats WHERE id > ${cursor} LIMIT ${max}` :
        `SELECT * FROM interface_stats WHERE id > ${0} ${sqlFilter}`

    // eslint-disable-next-line prefer-const
    const raw = db.prepare(sqlString).all()

    const data: any = {
      current:  Number(page),
      length: raw.length,
      max: max
    }

    if(Number(page) > 0){
      data.prev = Number(page) -1;
    }
    if(data.length >= max){
      data.next = Number(page)+1
    }

    if(sqlFilter != ''){
        delete data.current
        if(data.next) delete data.next
        if(data.prev) delete data.prev
    }
    data.data = raw
    return res.json(data).status(200);

    //   const raw = await db
    //     .prepare(`SELECT * FROM interface_stats WHERE timestamp BETWEEN ${start} AND ${end}`)
    //     .all()
    // const stats: any = {}
    // for (const entry of raw) {
    //   if (stats[entry.api_name]) {
    //     stats[entry.api_name].tFinals.push(entry.tfinal)
    //   } else {
    //     stats[entry.api_name] = {
    //       tMax: 0,
    //       tMin: 0,
    //       tAvg: 0,
    //       tTotal: 0,
    //       tFinals: [entry.tfinal],
    //     }
    //   }
    // }
    //
    // for (const api_name in stats) {
    //   /* eslint-disable security/detect-object-injection */
    //   stats[api_name].tFinals.sort()
    //   const length = stats[api_name].tFinals.length
    //   const index = length > 0 ? length - 1 : 0
    //   stats[api_name].tMax = stats[api_name].tFinals[index]
    //   stats[api_name].tMin = stats[api_name].tFinals[0]
    //   stats[api_name].count = length
    //
    //   for (const tfinal of stats[api_name].tFinals) {
    //     stats[api_name].tTotal += tfinal
    //   }
    //   stats[api_name].tAvg = stats[api_name].tTotal / stats[api_name].tFinals.length
    //   delete stats[api_name].tFinals
    //   /* eslint-enable security/detect-object-injection */
    // }
    // const info = {
    //   date: {
    //     start: new Date(start).toString(),
    //     end: new Date(end).toString(),
    //   },
    //   stats: stats,
    // }
    // return res.json(info).status(200)
  } catch (e) {
    console.log(e);
    return res.json(e).status(500)
  }
})

/**
 * @route GET /log/cleanStatTable
 */
router.route('/cleanStatTable').get(async (req: any, res: any) => {
  try {
    await db.exec('DELETE FROM interface_stats')
    debug_info.interfaceDB_cleanTime = Date.now()
    res.send({ success: true }).status(200)
  } catch (e: any) {
    res.send(e).status(500)
  }
})

/**
 * @route GET /log/txs
 */
router.route('/txs').get(async function (req: any, res: any) {
  try {
    // this is a very bad security practice !
    // Not enough input sanitization :(
    // Exposed Primary keys :(
    // Should be ok though as long as this endpoint is private and only for debug
    const page = req.query.page || 0
    const max = req.query.max || 1000
    const cursor: number = page * max
    const start = req.query.start ? timeInputProcessor(req.query.start) : null
    const end = req.query.end ? timeInputProcessor(req.query.end) : null

    if(start && !end){
        const tx = db.prepare(`SELECT * FROM transactions WHERE timestamp>${start} LIMIT 1`).all()
        return res.json(tx[0]).status(200);
    }
    if(!start && end){
        // returns closet entry
        const tx = db.prepare(`SELECT *
                                FROM transactions
                                WHERE ABS(timestamp - ${end}) = (
                                  SELECT MIN(ABS(timestamp - ${end}))
                                  FROM transactions
                                )
                                LIMIT 1 OFFSET 0;`).all()
        return res.json(tx[0]).status(200);
    }

    // gets SQL filters from the query string based on the provided parameters
    const sqlFilter = prepareSQLFilters({
        nodeUrl: req.query.nodeUrl,
        type: req.query.type,
        reason: req.query.reason,
        injected: req.query.injected,
        ip: req.query.ip ,
        to: req.query.to,
        from: req.query.from,
        hash: req.query.hash
    })

    // creates the prefix of the SQL query string based on the provided parameters
    const sqlString = (sqlFilter == '') ?
        `SELECT * FROM transactions WHERE id > ${cursor} LIMIT ${max}` :
        `SELECT * FROM transactions WHERE id > ${0} ${sqlFilter}`

    // performs the SQL query
    // eslint-disable-next-line prefer-const
    const txs = db.prepare(sqlString).all()

    const data: any = {
      current: Number(page),
      length: txs.length,
    }

    if(Number(page) > 0){
      data.prev = Number(page) -1;
    }

    if(data.length >= max){
      data.next = Number(page)+1
    }

    data.data = txs

    if(sqlFilter != ''){
        delete data.current
        if(data.next) delete data.next
        if(data.prev) delete data.prev
    }

    return res.json(data).status(200);
  } catch (e: any) {
      console.log(e);
    res.send(e).status(500)
  }
})

/**
 * @route GET /log/cleanTxTable
 */
router.route('/cleanTxTable').get(async function (req: any, res: any) {
  try {
    // delete trasanctions from DB
    await db.exec('DELETE FROM transactions')
    debug_info.txDB_cleanTime = Date.now()
    res.send({ success: true }).status(200)
  } catch (e: any) {
    res.send(e).status(500)
  }
})

/**
 * @route GET /log/startTxCapture
 */
router.route('/startTxCapture').get(async function (req: any, res: any) {
    if(CONFIG.recordTxStatus) return res.json({message: "Tx recording already enabled"}).status(304);
  debug_info.txRecordingStartTime = Date.now();
  debug_info.txRecordingEndTime = 0;
  CONFIG.recordTxStatus = true

  res.json({message:'Transaction status recording enabled'}).status(200)
})

/**
 * @route GET /log/stopTxCapture
 */
router.route('/stopTxCapture').get(async function (req: any, res: any) {
    if(!CONFIG.recordTxStatus) return res.json({message: "Tx recording already stopped"}).status(304);
  debug_info.txRecordingEndTime = Date.now();
  CONFIG.recordTxStatus = false
  res.send({message: 'Transaction status recording disabled'}).status(200)
})

/**
 * @route GET /log/startRPCCapture
 */
router.route('/startRPCCapture').get(async function (req: any, res: any) {
    if(CONFIG.statLog) {
        return res.json({message: "Interface stats are recording recording already"}).status(304);
    }
  debug_info.interfaceRecordingStartTime = Date.now();
  debug_info.interfaceRecordingEndTime = 0;
  CONFIG.statLog = true

  res.json({message:'RPC interface recording enabled'}).status(200)
})

/**
 * @route GET /log/stopRPCCapture
 */
router.route('/stopRPCCapture').get(async function (req: any, res: any) {
    if(!CONFIG.statLog) {
        return res.json({message: "Interface stats recording already stopped"}).status(304);
    }
  debug_info.interfaceRecordingEndTime = Date.now();
  CONFIG.statLog = false
  res.json({message:'RPC interface recording disabled'}).status(200)
})

/**
 * @route GET /log/status
 */
router.route('/status').get(async function (req: any, res: any) {
    debug_info.isRecordingTx = CONFIG.recordTxStatus
    debug_info.isRecordingInterface = CONFIG.statLog
  res.json(debug_info).status(200)
})
