import { bufferToHex } from 'ethereumjs-util'
import { DetailedTxStatus, TxStatus } from './api'
import { db } from './storage/sqliteStorage'
import { getReasonEnumCode, getTransactionObj } from './utils'

import EventEmitter from 'events'
import { CONFIG as config } from './config'

/**
 * This file contains the implementation of the logger module.
 * It provides functions for logging API performance data and transaction status.
 */

/**
 * Represents an array of objects containing performance log data for API calls.
 */
type ApiPerfLogData = {
  tfinal: number
  timestamp: number
  api_name: string
  nodeUrl?: string
  success: boolean
  reason?: string
  hash?: string
}[]

/**
 * Represents a ticket for logging API performance.
 * The `ApiPerfLogTicket` object stores information about the API being logged,
 * including the API name and the start timer value.
 */
type ApiPerfLogTicket = {
  [key: string]: {
    api_name: string
    start_timer: number
  }
}

export let apiPerfLogData: ApiPerfLogData = []
export let apiPerfLogTicket: ApiPerfLogTicket = {}
export const logEventEmitter = new EventEmitter()

/**
 * Represents the debug information object.
 * This object contains various properties related to debugging and logging.
 */
export const debug_info = {
  isRecordingInterface: config.statLog,
  isRecordingTx: config.recordTxStatus,
  txRecordingStartTime: 0,
  txRecordingEndTime: 0,
  interfaceRecordingStartTime: 0,
  interfaceRecordingEndTime: 0,
  txDB_cleanTime: 0,
  interfaceDB_cleanTime: 0,
}


/**
 * Saves the interface statistics to the database.
 * This function retrieves the performance log data from the `apiPerfLogData` array,
 * constructs SQL queries to insert the data into the `interface_stats` table,
 * and executes the queries using the `db.exec` method.
 * After saving the data, it clears the `apiPerfLogData` array and `apiPerfLogTicket` object.
 */
export async function saveInterfaceStat() {
  console.log(apiPerfLogData)
  try {
    // eslint-disable-next-line prefer-const
    let { api_name, tfinal, timestamp, nodeUrl, success, reason, hash } = apiPerfLogData[0]
    // nodeUrl = nodeUrl ? nodeUrl : new URL(nodeUrl as string).hostname
    let placeholders = `NULL, '${api_name}', '${tfinal}','${timestamp}', '${nodeUrl}', '${success}', '${reason}', '${hash}'`
    let sql = 'INSERT INTO interface_stats VALUES (' + placeholders + ')'
    for (let i = 1; i < apiPerfLogData.length; i++) {
      // eslint-disable-next-line prefer-const
      let { api_name, tfinal, timestamp, nodeUrl, success, reason, hash } = apiPerfLogData[i] // eslint-disable-line security/detect-object-injection

      // nodeUrl = nodeUrl ? nodeUrl : new URL(nodeUrl as string).hostname
      placeholders = `NULL, '${api_name}', '${tfinal}','${timestamp}', '${nodeUrl}', '${success}', '${reason}', '${hash}'`
      sql = sql + `, (${placeholders})`
    }

    await db.exec(sql)
  } catch (e) {
    console.log(e)
  }

  apiPerfLogData = []
  apiPerfLogTicket = {}
}


/**
 * Sets up log event listeners.
 * This function listens for various log events and performs specific actions based on the event.
 * - For 'fn_start' event, it stores the API name and start timer in the apiPerfLogTicket object.
 * - For 'fn_end' event, it calculates the time taken (tfinal) for the API call, stores the relevant data in apiPerfLogData, and deletes the corresponding ticket from apiPerfLogTicket.
 * - For 'tx_insert_db' event, it processes the transaction statuses and saves them in the database.
 */
export function setupLogEvents() {
  /* eslint-disable security/detect-object-injection */
  if (config.statLog) {
    logEventEmitter.on('fn_start', (ticket: string, api_name: string, start_timer: number) => {
      if (config.statLog !== true) return
      apiPerfLogTicket[ticket] = {
        api_name: api_name,
        start_timer: start_timer,
      }
    })

    logEventEmitter.on(
      'fn_end',
      (
        ticket: string,
        data: { nodeUrl?: string; success: boolean; reason?: string; hash?: string },
        end_timer: number
      ) => {
        if (config.statLog !== true) return
        const timestamp = Date.now()

        if (!Object.prototype.hasOwnProperty.call(apiPerfLogTicket, ticket)) return

        const { api_name, start_timer } = apiPerfLogTicket[ticket]
        // tfinal is the time it took to complete an api
        const tfinal = end_timer - start_timer
        apiPerfLogData.push({
          api_name: api_name,
          tfinal: tfinal,
          timestamp: timestamp,
          nodeUrl: data.nodeUrl,
          success: data.success,
          reason: data?.reason,
          hash: data?.hash,
        })
        delete apiPerfLogTicket[ticket]
        if (apiPerfLogData.length >= 10000) saveInterfaceStat()
      }
    )
  }

  logEventEmitter.on('tx_insert_db', async (_txs: TxStatus[]) => {
    if (config.recordTxStatus !== true) return
    const txs = _txs as any[]
    const detailedList: DetailedTxStatus[] = []

    for await (const txStatus of txs) {
      // console.log(txStatus)

      if (!txStatus.raw) continue

      try {
        let type = 'other'
        const tx = await getTransactionObj({ raw: txStatus.raw })

        delete txStatus.raw

        if (tx.to === undefined && tx.data) {
          type = 'contract deployment'
        } else if (tx.value && tx.data.length === 0) {
          type = 'coin transfer'
        } else {
          type = 'contract call'
        }

        txStatus.accepted = getReasonEnumCode(txStatus.reason)

        detailedList.push({
          ...txStatus,
          type: type,
          to: bufferToHex(tx.to),
          from: bufferToHex(tx.getSenderAddress()),
          timestamp: txStatus.timestamp,
          nodeUrl: txStatus.nodeUrl,
        })
      } catch (e) {
        continue
      }
    }
    txStatusSaver(detailedList)
  })
  /* eslint-enable security/detect-object-injection */
}

/**
 * Saves transaction status to the database.
 * @param _txs - An array of DetailedTxStatus objects representing the transaction status.
 * @returns - A promise that resolves when the transaction status is saved.
 */
export async function txStatusSaver(_txs: DetailedTxStatus[]) {
  const txs = _txs

  const bulkInsertTxs = true
  if (bulkInsertTxs) {
    if (txs.length === 0) return
    const prepareBulkInsertSQL = (txs: DetailedTxStatus[]) => {
      // items order {txHash, injected, accepted, reason, type, to, from, ip, timestamp}
      // eslint-disable-next-line prefer-const
      let { txHash, injected, accepted, reason, type, to, from, ip, timestamp, nodeUrl } = txs[0]
      // nodeUrl = nodeUrl ? nodeUrl : new URL(nodeUrl as string).hostname

      let placeholders = `NULL, '${txHash}', '${type}', '${to}', '${from}', '${injected}', '${accepted}', '${reason}', '${ip}', '${timestamp}', '${nodeUrl}'`
      let sql = 'INSERT OR REPLACE INTO transactions VALUES (' + placeholders + ')'

      for (let i = 1; i < txs.length; i++) {
        // eslint-disable-next-line prefer-const
        let { txHash, injected, accepted, reason, type, to, from, ip, timestamp, nodeUrl } = txs[i]
        // nodeUrl = nodeUrl ? nodeUrl : new URL(nodeUrl as string).hostname
        placeholders = `NULL, '${txHash}', '${type}', '${to}', '${from}', '${injected}', '${accepted}', '${reason}', '${ip}', '${timestamp}', '${nodeUrl}'`
        sql = sql + `, (${placeholders})`
      }
      return sql
    }
    try {
      await db.exec(prepareBulkInsertSQL(txs))
    } catch (e) {
      console.log(e)
    }
    return
  }

  // construct string to be a valid sql string, NOTE> insert value needs to be in order
  // const prepareSQL = ({
  //   txHash,
  //   injected,
  //   accepted,
  //   reason,
  //   type,
  //   to,
  //   from,
  //   ip,
  //   timestamp,
  // }: DetailedTxStatus) => {
  //   return (
  //     `INSERT OR REPLACE INTO transactions` +
  //     ` VALUES (NULL, '${txHash}', '${type}', '${to}', '${from}', '${injected}', '${accepted}', '${reason}', '${ip}', '${timestamp}')`
  //   )
  // }
  //
  // for await (const tx of txs) {
  //   try {
  //     await db.exec(prepareSQL(tx))
  //   } catch (e) {
  //     continue
  //   }
  // }
}
