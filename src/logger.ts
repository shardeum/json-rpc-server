import { bufferToHex } from 'ethereumjs-util'
import { DetailedTxStatus, TxStatus } from './api'
import { db } from './storage/sqliteStorage'
import { getReasonEnumCode, getTransactionObj, TxStatusCode } from './utils'

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
    const stmt = db.prepare(`
      INSERT INTO interface_stats 
      (api_name, tfinal, timestamp, nodeUrl, success, reason, hash) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const insertMany = db.transaction((items) => {
      for (const item of items) {
        stmt.run(
          item.api_name,
          item.tfinal,
          item.timestamp,
          item.nodeUrl,
          item.success ? 1 : 0,
          item.reason || null,
          item.hash || null
        )
      }
    })

    insertMany(apiPerfLogData)
  } catch (e) {
    console.log('Error saving interface stats:', e)
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
export async function txStatusSaver(txs: DetailedTxStatus[]): Promise<void> {
  if (txs.length === 0) return

  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO transactions 
      (hash, type, to, from, injected, accepted, reason, ip, timestamp, nodeUrl) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertMany = db.transaction((items) => {
      for (const item of items) {
        stmt.run(
          item.txHash,
          item.type,
          item.to,
          item.from,
          item.injected ? 1 : 0,
          // if accepted is a boolean, convert it to the corresponding TxStatusCode
          // otherwise, use the value as is
          typeof item.accepted === 'boolean' 
            ? (item.accepted ? TxStatusCode.SUCCESS : TxStatusCode.BAD_TX) 
            : item.accepted,
          item.reason || null,
          item.ip || null,
          item.timestamp,
          item.nodeUrl || null
        )
      }
    })

    insertMany(txs)
  } catch (e) {
    console.error('Error inserting transactions:', e)
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
