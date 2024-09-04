import { bufferToHex } from 'ethereumjs-util'
import { DetailedTxStatus, TxStatus } from './api'
import { db } from './storage/sqliteStorage'
import { getReasonEnumCode, getTransactionObj } from './utils'

import EventEmitter from 'events'
import { CONFIG as config } from './config'

type ApiPerfLogData = {
  tfinal: number
  timestamp: number
  api_name: string
  nodeUrl?: string
  success: boolean
  reason?: string
  hash?: string
}[]

type ApiPerfLogTicket = {
  [key: string]: {
    api_name: string
    start_timer: number
  }
}

export let apiPerfLogData: ApiPerfLogData = []
export let apiPerfLogTicket: ApiPerfLogTicket = {}
export const logEventEmitter = new EventEmitter()

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

export async function saveInterfaceStat(): Promise<void> {
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

export function setupLogEvents(): void {
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
    const txs = _txs as TxStatus[]
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
          to: bufferToHex(tx.to ? tx.to.toBuffer() : Buffer.from('')),
          from: bufferToHex(tx.getSenderAddress().toBuffer()),
          timestamp: txStatus.timestamp.toString(),
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

// this function save recorded transaction to sqlite with its tx type
export async function txStatusSaver(_txs: DetailedTxStatus[]): Promise<void> {
  const txs = _txs

  const bulkInsertTxs = true
  if (bulkInsertTxs) {
    if (txs.length === 0) return
    const prepareBulkInsertSQL = (txs: DetailedTxStatus[]): string => {
      // items order {txHash, injected, accepted, reason, type, to, from, ip, timestamp}
      // eslint-disable-next-line prefer-const
      let { txHash, injected, accepted, reason, type, to, from, ip, timestamp, nodeUrl } = txs[0]
      // nodeUrl = nodeUrl ? nodeUrl : new URL(nodeUrl as string).hostname

      let placeholders = `NULL, '${txHash}', '${type}', '${to}', '${from}', '${injected}', '${accepted}', '${reason}', '${ip}', '${timestamp}', '${nodeUrl}'`
      let sql = 'INSERT OR REPLACE INTO transactions VALUES (' + placeholders + ')'

      for (let i = 1; i < txs.length; i++) {
        // eslint-disable-next-line prefer-const
        let { txHash, injected, accepted, reason, type, to, from, ip, timestamp, nodeUrl } = txs[i] // eslint-disable-line security/detect-object-injection
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
