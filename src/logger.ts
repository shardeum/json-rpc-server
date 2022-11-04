import { bufferToHex } from "ethereumjs-util";
import { DetailedTxStatus, TxStatus, txStatuses, verbose } from "./api";
import {db} from './storage/sqliteStorage';
import { getReasonEnumCode, getTransactionObj } from "./utils";

const EventEmitter = require('events');
const config = require('./config');

type ApiPerfLogData = {
    tfinal: number,
    timestamp: number,
    api_name: string,
}[]

type ApiPerfLogTicket = {
    [key: string]: {
        api_name: string
        start_timer: number
    }
}

export const mutedEvents: any = {
    on: () => {
        console.log("=> Logging is disabled")
    },
    emit: () => {}
}

export let apiPerfLogData: ApiPerfLogData = []
export let apiPerfLogTicket: ApiPerfLogTicket = {}
export const logEventEmitter =  new EventEmitter() 

export async function saveInterfaceStat(){

    const { api_name, tfinal, timestamp } = apiPerfLogData[0]
    let placeholders = `NULL, '${api_name}', '${tfinal}','${timestamp}'`
    let sql = 'INSERT INTO interface_stats VALUES (' + placeholders + ')';
    for (let i = 1; i < apiPerfLogData.length; i++) {
        const { api_name, tfinal, timestamp } = apiPerfLogData[i]
        placeholders = `NULL, '${api_name}', '${tfinal}','${timestamp}'`
      sql = sql + `, (${placeholders})`;
    }

    await db.exec(sql)
    apiPerfLogData = []
    apiPerfLogTicket = {}
}

export function setupLogEvents () {
    if(config.statLog){
        logEventEmitter.on('fn_start', (ticket: string, api_name: string, start_timer: number) => {

          apiPerfLogTicket[ticket] = {
            api_name: api_name,
            start_timer: start_timer
          }
        })

        logEventEmitter.on('fn_end', (ticket: string, end_timer: number) => {
          const timestamp = Date.now()

          if (!apiPerfLogTicket.hasOwnProperty(ticket)) return

          const {api_name, start_timer} = apiPerfLogTicket[ticket]
          // tfinal is the time it took to complete an api
          const tfinal = end_timer - start_timer;
          apiPerfLogData.push({
              api_name: api_name,
              tfinal: tfinal,
              timestamp: timestamp,
          })
          delete apiPerfLogTicket[ticket]
          if(apiPerfLogData.length >= 10000) saveInterfaceStat()
        })
    }

    if(config.recordTxStatus){
        logEventEmitter.on('tx_insert_db', async(_txs: TxStatus[]) => {
            const txs = _txs as any[];
            const detailedList: DetailedTxStatus[] = [];

            for await (const txStatus of txs){
              // console.log(txStatus)

              if(!txStatus.raw) continue

              try{
                let type = 'other'
                const tx = await getTransactionObj({raw: txStatus.raw})

                delete txStatus.raw


                if((tx.to === undefined) && tx.data){
                   type = "contract deployment"
                }
                else if(tx.value && (tx.data.length === 0)){
                   type = "coin transfer"
                }
                else{
                   type = "contract call"
                }

                txStatus.accepted = getReasonEnumCode(txStatus.reason);

                detailedList.push({
                  ...txStatus,
                  type: type,
                  to: bufferToHex(tx.to),
                  from: bufferToHex(tx.getSenderAddress()),
                  timestamp: txStatus.timestamp,
                })
              }catch(e){
                continue
              }
            }
            txStatusSaver(detailedList);
        })
    }
}

// this function save recorded transaction to sqlite with its tx type 
export async function txStatusSaver(_txs: DetailedTxStatus[]) {
    const txs = _txs;

    const bulkInsertTxs = true
    if (bulkInsertTxs) {
      if (txs.length === 0) return
      const prepareBulkInsertSQL = (txs: DetailedTxStatus[]) => {
        // items order {txHash, injected, accepted, reason, type, to, from, ip, timestamp}
        const { txHash, injected, accepted, reason, type, to, from, ip, timestamp } = txs[0]
        let placeholders = `NULL, '${txHash}', '${type}', '${to}', '${from}', '${injected}', '${accepted}', '${reason}', '${ip}', '${timestamp}'`
        let sql = 'INSERT OR REPLACE INTO transactions VALUES (' + placeholders + ')';
        for (let i = 1; i < txs.length; i++) {
          const { txHash, injected, accepted, reason, type, to, from, ip, timestamp } = txs[i]
          placeholders = `NULL, '${txHash}', '${type}', '${to}', '${from}', '${injected}', '${accepted}', '${reason}', '${ip}', '${timestamp}'`
          sql = sql + `, (${placeholders})`;
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
    const prepareSQL = ({txHash, injected, accepted, reason, type, to, from, ip, timestamp}: DetailedTxStatus) => {
        return `INSERT OR REPLACE INTO transactions` +
                ` VALUES (NULL, '${txHash}', '${type}', '${to}', '${from}', '${injected}', '${accepted}', '${reason}', '${ip}', '${timestamp}')`
    }
    
    for await(const tx of txs) {
        try{
            await db.exec(prepareSQL(tx))
        }catch(e){
            continue
        }
    }
}
