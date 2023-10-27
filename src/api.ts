import axios from 'axios'
import WebSocket from 'ws'
import { serializeError } from 'eth-rpc-errors'
import { BN, bufferToHex, isHexPrefixed, keccak256 } from 'ethereumjs-util'
import {
  calculateInternalTxHash,
  getAccount,
  getArchiverUrl,
  getBaseUrl,
  getFilterId,
  getTransactionObj,
  intStringToHex,
  parseFilterDetails,
  RequestMethod,
  requestWithRetry,
  sleep,
  getGasPrice,
  TxStatusCode,
  getCode,
  replayTransaction,
  parseAndValidateStringInput,
  fetchStorage,
  replayGas,
  hexToBN,
  fetchTxReceiptFromArchiver,
} from './utils'
import crypto from 'crypto'
import { logEventEmitter } from './logger'
import { CONFIG, CONFIG as config } from './config'
import { logSubscriptionList } from './websocket/clients'
import { ipport } from './server'
import { subscriptionEventEmitter } from './websocket'
import { evmLogProvider_ConnectionStream } from './websocket/distributor'
import * as Types from './types'
import { addEntry, checkEntry, getGasEstimate, removeEntry } from './service/gasEstimate'

export const verbose = config.verbose
const MAX_ESTIMATE_GAS = new BN(30_000_000)

const lastCycleCounter = '0x0'
let lastBlockInfo = {
  blockNumber: lastCycleCounter,
  timestamp: '0x0',
}

//const errorHexStatus: string = '0x' //0x0 if you want an error! (handy for testing..)
const errorCode = 500 //server internal error
const errorBusy = { code: errorCode, message: 'Busy or error' }
export let txStatuses: TxStatus[] = []
const maxTxCountToStore = 10000
const txMemPool: any = {}
const nonceTracker: any = {}
let totalResult = 0
let nonceFailCount = 0

type InjectResponse = {
  success: boolean
  reason: string
  status: number
}

export type TxStatus = {
  txHash: string
  raw: string
  injected: boolean
  accepted: boolean
  reason: string
  timestamp: number // if timestamp is not provided in the tx, maybe Date.now()
  ip?: string
  nodeUrl?: string
}
export type DetailedTxStatus = {
  ip?: string
  txHash: string
  type: string
  to: string
  from: string
  injected: boolean
  accepted: TxStatusCode.BAD_TX | TxStatusCode.SUCCESS | TxStatusCode.BUSY | TxStatusCode.OTHER_FAILURE
  reason: string
  timestamp: string
  nodeUrl?: string
}

function hexStrToInt(hexStr: string) {
  return parseInt(hexStr.slice(2), 16)
}

function isHex(str: string) {
  const regexp = /^0x[0-9a-fA-F]+$/
  return regexp.test(str)
}

let filtersMap: Map<string, Types.InternalFilter> = new Map()

function extractTransactionObject(bigTransaction: any, transactionIndexArg?: number) {
  if (bigTransaction) {
    const tx = bigTransaction.wrappedEVMAccount || bigTransaction
    return {
      blockHash: tx.readableReceipt.blockHash,
      blockNumber: tx.readableReceipt.blockNumber,
      from: tx.readableReceipt.from,
      gas:
        '0x' +
        (hexStrToInt(tx.readableReceipt.gasUsed) + hexStrToInt(tx.readableReceipt.gasRefund)).toString(),
      gasPrice: tx.readableReceipt.gasPrice,
      maxFeePerGas: undefined,
      maxPriorityFeePerGas: undefined,
      hash: tx.txHash || tx.readableReceipt.transactionHash,
      input: tx.readableReceipt.data,
      nonce: tx.readableReceipt.nonce,
      to: tx.readableReceipt.to,
      transactionIndex: transactionIndexArg ? '0x' + transactionIndexArg.toString(16) : undefined,
      value: tx.readableReceipt.value,
      type: tx.readableReceipt.type,
      chainId: tx.readableReceipt.chainId,
      v: tx.readableReceipt.v,
      r: tx.readableReceipt.r,
      s: tx.readableReceipt.s,
    }
  } else {
    return null
  }
}

function extractTransactionReceiptObject(bigTransaction: any, transactionIndexArg?: number) {
  if (bigTransaction) {
    const tx = bigTransaction.wrappedEVMAccount || bigTransaction
    return {
      blockHash: tx.readableReceipt.blockHash,
      blockNumber: tx.readableReceipt.blockNumber,
      contractAddress: tx.readableReceipt.contractAddress,
      cumulativeGasUsed: tx.readableReceipt.cumulativeGasUsed,
      effectiveGasPrice: tx.readableReceipt.gasPrice,
      from: tx.readableReceipt.from,
      gasUsed: tx.readableReceipt.gasUsed,
      logs: tx.readableReceipt.logs,
      logsBloom: tx.readableReceipt.logsBloom,
      status: tx.readableReceipt.status,
      to: tx.readableReceipt.to,
      transactionHash: tx.txHash || tx.readableReceipt.transactionHash,
      transactionIndex: transactionIndexArg ? '0x' + transactionIndexArg.toString(16) : undefined,
      type: bigTransaction.transactionType,
    }
  } else {
    return null
  }
}

function buildLogAPIUrl(request: Types.LogQueryRequest) {
  const apiUrl = `${config.explorerUrl}/api/log`
  const queryParams = []

  // Check if each query parameter exists in the request object and add it to the queryParams array if it does
  if (request.address) {
    queryParams.push(`address=${request.address}`)
  }
  if (request.topics && request.topics.length > 0) {
    queryParams.push(`topics=${JSON.stringify(request.topics)}`)
    // if (request.topics[0]) {
    //   queryParams.push(`topic0=${request.topics[0]}`);
    // }
    // if (request.topics[1]) {
    //   queryParams.push(`topic1=${request.topics[1]}`);
    // }
    // if (request.topics[2]) {
    //   queryParams.push(`topic2=${request.topics[2]}`);
    // }
    // if (request.topics[3]) {
    //   queryParams.push(`topic3=${request.topics[3]}`);
    // }
  }
  if (request.fromBlock) {
    queryParams.push(`fromBlock=${request.fromBlock}`)
  }
  if (request.toBlock) {
    queryParams.push(`toBlock=${request.toBlock}`)
  }
  // Combine the base URL with the query parameters
  return `${apiUrl}${queryParams.length > 0 ? `?${queryParams.join('&')}` : ''}`
}

async function getLogsFromExplorer(request: Types.LogQueryRequest): Promise<any[]> {
  let updates: any[] = []
  let currentPage = 1

  try {
    if (request == null) return []
    let baseUrl = buildLogAPIUrl(request)
    let fullUrl = baseUrl + `&page=${currentPage}`
    if (config.verbose) console.log(`getLogsFromExplorer fullUrl: ${fullUrl}`)
    let res = await axios.get(fullUrl)

    if (res.data && res.data.success && res.data.logs.length > 0) {
      const logs = res.data.logs.map((item: any) => item.log)
      updates = updates.concat(logs)
      currentPage += 1
      const totalPages = res.data.totalPages
      while (currentPage <= totalPages) {
        res = await axios.get(`${baseUrl}&page=${currentPage}`)
        if (res.data && res.data.success) {
          const logs = res.data.logs.map((item: any) => item.log)
          updates = updates.concat(logs)
        }
        currentPage += 1
      }
    }
  } catch (e) {
    console.error(`Error getting filter updates`, e)
  }
  return updates
}

async function getCurrentBlockInfo() {
  if (verbose) console.log('Running getCurrentBlockInfo')
  let result = { ...lastBlockInfo, nodeUrl: undefined }

  try {
    if (verbose) console.log('Querying getCurrentBlockInfo from validator')
    const res = await requestWithRetry(RequestMethod.Get, `/eth_blockNumber`)
    const blockNumber = res.data.blockNumber
    const timestamp = Date.now()
    result = {
      nodeUrl: res.data.nodeUrl,
      blockNumber: blockNumber,
      timestamp: intStringToHex(String(timestamp)),
    } as any
    lastBlockInfo = { ...result }
    return result
  } catch (e) {
    console.log('Unable to get cycle number', e)
  }
  return result
}

async function getCurrentBlock() {
  let blockNumber = '0'
  let timestamp = '0x55ba467c'
  let nodeUrl
  try {
    const result = await getCurrentBlockInfo()
    nodeUrl = result?.nodeUrl
    blockNumber = result.blockNumber
    timestamp = result.timestamp
  } catch (e) {
    console.log('Error getCurrentBlockInfo', e)
  }
  if (verbose) console.log('Running getcurrentBlock', blockNumber, timestamp)
  return {
    nodeUrl: nodeUrl,
    difficulty: '0x4ea3f27bc',
    extraData: '0x476574682f4c5649562f76312e302e302f6c696e75782f676f312e342e32',
    gasLimit: '0x4a817c800', // 20000000000   "0x1388",
    gasUsed: '0x0',
    hash: '0xdc0818cf78f21a8e70579cb46a43643f78291264dda342ae31049421c82d21ae',
    logsBloom:
      '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    miner: '0xbb7b8287f3f0a933474a79eae42cbca977791171',
    mixHash: '0x4fffe9ae21f1c9e15207b1f472d5bbdd68c9595d461666602f2be20daf5e7843',
    nonce: '0x689056015818adbe',
    number: blockNumber,
    parentHash: '0xe99e022112df268087ea7eafaf4790497fd21dbeeb6bd7a1721df161a6657a54',
    receiptsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
    sha3Uncles: '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
    size: '0x220',
    stateRoot: '0xddc8b0234c2e0cad087c8b389aa7ef01f7d79b2570bccb77ce48648aa61c904d',
    timestamp: timestamp,
    totalDifficulty: '0x78ed983323d',
    transactions: [],
    transactionsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
    uncles: [],
  }
}

async function getExplorerPendingTransactions() {
  const explorerURL = config.explorerUrl
  let txHashes: string[] = []
  let currentPage = 1
  let hasMorePages = true

  while (hasMorePages) {
    try {
      const response = await axios.get(
        `${explorerURL}/api/originalTx?pending=true&decode=true&page=${currentPage}`
      )
      if (response.data.success) {
        response.data.originalTxs.forEach((tx: { txHash: string }) => {
          txHashes.push(tx.txHash)
        })
        // If the current page has less than 10 transactions, it means we've reached the last page
        hasMorePages = response.data.originalTxs.length === 10
        currentPage++
      } else {
        hasMorePages = false
      }
    } catch (error) {
      console.log(error)
      hasMorePages = false
    }
  }

  return txHashes
}

export function createRejectTxStatus(txHash: string, reason: string, ip: string, nodeUrl?: string) {
  recordTxStatus({
    txHash: txHash,
    ip: ip,
    raw: '',
    injected: false,
    accepted: false,
    reason: reason,
    timestamp: Date.now(),
    nodeUrl: nodeUrl,
  })
}

export function recordTxStatus(txStatus: TxStatus) {
  txStatuses.push(txStatus)
  if (txStatuses.length > maxTxCountToStore && config.recordTxStatus) {
    saveTxStatus()
  }
}

function injectAndRecordTx(txHash: string, tx: any, args: any) {
  const { raw } = tx
  const { baseUrl } = getBaseUrl()
  totalResult += 1
  return new Promise((resolve, reject) => {
    axios
      .post(`${baseUrl}/inject`, tx)
      .then((response) => {
        const injectResult: InjectResponse = response.data

        if (
          injectResult &&
          injectResult.success === false &&
          injectResult.reason.includes('Transaction nonce')
        ) {
          nonceFailCount += 1
        }

        console.log('inject tx result', txHash, injectResult)
        console.log(`Total count: ${totalResult}, Nonce fail count: ${nonceFailCount}`)
        if (config.recordTxStatus === false) {
          return resolve({
            nodeUrl: baseUrl,
            success: injectResult ? injectResult.success : false,
            reason: injectResult.reason,
            status: injectResult.status,
          })
        }

        if (injectResult) {
          recordTxStatus({
            txHash,
            raw,
            injected: true,
            accepted: injectResult.success,
            reason: injectResult.reason || '',
            timestamp: tx.timestamp || Date.now(),
            ip: args[1000], // this index slot is reserved for ip, check injectIP middleware
            nodeUrl: baseUrl,
          })
          return resolve({
            nodeUrl: baseUrl,
            success: injectResult ? injectResult.success : false,
            reason: injectResult.reason,
            status: injectResult.status,
          })
        } else {
          recordTxStatus({
            txHash,
            raw,
            injected: false,
            accepted: false,
            reason: 'Unable to inject transaction into the network',
            timestamp: tx.timestamp || Date.now(),
            ip: args[1000], // this index slot is reserved for ip, check injectIP middleware
            nodeUrl: baseUrl,
          })
          reject({ nodeUrl: baseUrl, error: 'Unable inject transaction to the network' })
        }
      })
      .catch(() => {
        if (config.recordTxStatus)
          recordTxStatus({
            txHash,
            raw,
            injected: false,
            accepted: false,
            reason: 'Unable to inject transaction into the network',
            timestamp: tx.timestamp || Date.now(),
            ip: args[1000], // this index slot is reserved for ip, check injectIP middleware l
            nodeUrl: baseUrl,
          })
        reject({ nodeUrl: baseUrl, error: 'Unable inject transaction to the network' })
      })
  })
}

export async function saveTxStatus() {
  if (!config.recordTxStatus) return
  if (txStatuses.length === 0) return
  const txStatusesClone = [...txStatuses]
  txStatuses = []
  logEventEmitter.emit('tx_insert_db', txStatusesClone)
  const response = await axios.post(`${config.rpcDataServerUrl}/tx/status`, txStatusesClone)
  console.log('forward Tx Status To Explorer', response.data)
}

export const methods = {
  web3_clientVersion: async function (args: any, callback: any) {
    const api_name = 'web3_clientVersion'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    if (verbose) {
      console.log('Running web3_clientVersion', args)
    }
    if (verbose) {
      console.log('Running getCurrentBlockInfo', args)
    }
    const result = 'Mist/v0.9.3/darwin/go1.4.1'

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
  },
  web3_sha3: async function (args: any, callback: any) {
    const api_name = 'web3_sha3'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    if (verbose) {
      console.log('Running web3_sha', args)
    }
    const result = '0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad'

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
  },
  net_version: async function (args: any, callback: any) {
    const api_name = 'net_version'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    if (verbose) {
      console.log('Running net_version', args)
    }
    const chainId = config.chainId.toString()

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, chainId)
  },
  net_listening: async function (args: any, callback: any) {
    const api_name = 'net_listening'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running net_listening', args)
    }
    const result = true

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
  },
  net_peerCount: async function (args: any, callback: any) {
    const api_name = 'net_peerCount'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running net_peerCount', args)
    }
    const result = '0x2'

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
  },
  eth_protocolVersion: async function (args: any, callback: any) {
    const api_name = 'eth_protocolVersion'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_protocolVersion', args)
    }
    const result = '54'

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
  },
  eth_syncing: async function (args: any, callback: any) {
    const api_name = 'eth_syncing'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_syncing', args)
    }
    // RPC talks only to active nodes, so result is always false.
    const result = false

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
  },
  eth_coinbase: async function (args: any, callback: any) {
    const api_name = 'eth_coinbase'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_coinbase', args)
    }
    const result = ''

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
  },
  eth_mining: async function (args: any, callback: any) {
    const api_name = 'eth_mining'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_mining', args)
    }
    const result = true

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
  },
  eth_hashrate: async function (args: any, callback: any) {
    const api_name = 'eth_hashrate'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_hashrate', args)
    }
    const result = '0x38a'

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
  },
  eth_gasPrice: async function (args: any, callback: any) {
    const api_name = 'eth_gasPrice'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_gasPrice', args)
    }
    const fallbackGasPrice = '0x3f84fc7516' // 1 Gwei
    try {
      const { result } = await getGasPrice()
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      callback(null, result)
      return
    } catch (e) {
      console.log('Unable to get gas price', e)
    }
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, fallbackGasPrice)
  },
  eth_accounts: async function (args: any, callback: any) {
    const api_name = 'eth_accounts'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_accounts', args)
    }
    const result = ['0x407d73d8a49eeb85d32cf465507dd71d507100c1']

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
  },
  eth_blockNumber: async function (args: any, callback: any) {
    const api_name = 'eth_blockNumber'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_blockNumber', args)
    }
    const { blockNumber, nodeUrl } = await getCurrentBlockInfo()
    if (verbose) console.log('BLOCK NUMBER', blockNumber, parseInt(blockNumber, 16))
    if (blockNumber == null) {
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
      callback(null, '0x0')
    } else {
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
      callback(null, blockNumber)
    }
  },
  eth_getBalance: async function (args: any, callback: any) {
    const api_name = 'eth_getBalance'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_getBalance', args)
    }
    let balance = '0x0'
    let nodeUrl
    try {
      const address = args[0]
      if (verbose) console.log('address', address)
      if (verbose) console.log('ETH balance', typeof balance, balance)
      const res = await getAccount(address)
      const account = res.account
      nodeUrl = res.nodeUrl
      if (verbose) console.log('account', account)
      if (verbose) console.log('Shardium balance', typeof account.balance, account.balance)
      const SHD = intStringToHex(account.balance)
      if (verbose) console.log('SHD', typeof SHD, SHD)
      balance = intStringToHex(account.balance)
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
      callback(null, balance)
    } catch (e) {
      // if (verbose) console.log('Unable to get account balance', e)
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: false }, performance.now())
      callback(null, balance)
    }
    if (verbose) console.log('Final balance', balance)
  },
  eth_getStorageAt: async function (args: any, callback: any) {
    const api_name = 'eth_getStorageAt'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_getStorageAt', args)
    }
    const result = '0x00000000000000000000000000000000000000000000000000000000000004d2'
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
  },
  eth_getTransactionCount: async function (args: any, callback: any) {
    const api_name = 'eth_getTransactionCount'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running getTransactionCount', args)
    }
    let nodeUrl
    try {
      const address = args[0]
      const res = await getAccount(address)
      const account = res.account
      nodeUrl = res.nodeUrl
      if (account) {
        const nonce = parseInt(account.nonce)
        let result = '0x' + nonce.toString(16)
        if (result === '0x') result = '0x0'
        if (verbose) {
          console.log('account.nonce', account.nonce)
          console.log('Transaction count', result)
        }

        logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
        callback(null, result)
      } else {
        logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
        callback(null, '0x0')
      }
    } catch (e) {
      if (verbose) console.log('Unable to getTransactionCount', e)
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: false }, performance.now())
    }
  },
  eth_getBlockTransactionCountByHash: async function (args: any, callback: any) {
    const api_name = 'eth_getBlockTransactionCountByHash'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_getBlockTransactionCountByHash', args)
    }
    let blockHash = args[0]
    if (config.queryFromValidator && config.queryFromExplorer) {
      const explorerUrl = config.explorerUrl
      if (blockHash === 'latest') {
        const res = await requestWithRetry(RequestMethod.Get, `/eth_getLatestBlockHash`)
        blockHash = res.data.latestBlockHash
      }
      const res = await axios.get(`${explorerUrl}/api/transaction?blockHash=${blockHash}`)
      if (verbose) {
        console.log('url', `${explorerUrl}/api/transaction?blockHash=${blockHash}`)
        console.log('res', JSON.stringify(res.data))
      }

      let result = '0x' + res.data.transactions.length.toString(16)

      const nodeUrl = config.explorerUrl
      if (verbose) console.log('BLOCK TRANSACTIONS COUNT DETAIL', result)
      callback(null, result)
      logEventEmitter.emit(
        'fn_end',
        ticket,
        { nodeUrl, success: res.data.transactions.length ? true : false },
        performance.now()
      )
    } else {
      console.log('queryFromValidator and/or queryFromExplorer turned off. Could not process request')
      callback(null, [])
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    }
  },
  eth_getBlockTransactionCountByNumber: async function (args: any, callback: any) {
    const api_name = 'eth_getBlockTransactionCountByNumber'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_getBlockTransactionCountByNumber', args)
    }
    let blockNumber = args[0]
    if (blockNumber !== 'latest') blockNumber = parseInt(blockNumber, 16)
    if (config.queryFromValidator && config.queryFromExplorer) {
      const explorerUrl = config.explorerUrl
      if (blockNumber === 'latest') {
        const res = await requestWithRetry(RequestMethod.Get, `/eth_getLatestBlockNumber`)
        blockNumber = res.data.latestBlockNumber
      }
      const res = await axios.get(`${explorerUrl}/api/transaction?blockNumber=${blockNumber}`)
      if (verbose) {
        console.log('url', `${explorerUrl}/api/transaction?blockNumber=${blockNumber}`)
        console.log('res', JSON.stringify(res.data))
      }

      let result = '0x' + res.data.transactions.length.toString(16)

      const nodeUrl = config.explorerUrl
      if (verbose) console.log('BLOCK TRANSACTIONS COUNT DETAIL', result)
      callback(null, result)
      logEventEmitter.emit(
        'fn_end',
        ticket,
        { nodeUrl, success: res.data.transactions.length ? true : false },
        performance.now()
      )
    } else {
      console.log('queryFromExplorer turned off. Could not process request')
      callback(null, [])
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    }
  },
  eth_getUncleCountByBlockHash: async function (args: any, callback: any) {
    const api_name = 'eth_getUncleCountByBlockHash'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running getUncleCountByBlockHash', args)
    }
    const result = '0x0'

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
  },
  eth_getUncleCountByBlockNumber: async function (args: any, callback: any) {
    const api_name = 'eth_getUncleCountByBlockNumber'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running getUnbleCountByBlockNumber', args)
    }
    const result = '0x0'

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
  },
  eth_getCode: async function (args: any, callback: any) {
    const api_name = 'eth_getCode'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running getCode', args)
    }
    let nodeUrl
    try {
      const res = await getCode(args[0])
      const contractCode = res.contractCode
      nodeUrl = res.nodeUrl ? res.nodeUrl : undefined

      if (verbose) console.log('eth_getCode result', contractCode)
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
      callback(null, contractCode)
      return
    } catch (e) {
      console.log('Unable to eth_getCode', e)
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: false }, performance.now())
    }
  },
  eth_signTransaction: async function (args: any, callback: any) {
    const api_name = 'eth_signTransaction'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_signTransaction', args)
    }
    const result =
      '0xa3f20717a250c2b0b729b7e5becbff67fdaef7e0699da4de7ca5895b02a170a12d887fd3b17bfdce3481f10bea41f45ba9f709d39ce8325427b57afcfc994cee1b'
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
  },
  eth_sendTransaction: async function (args: any, callback: any) {
    const api_name = 'eth_sendTransaction'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    if (verbose) {
      console.log('Running sendTransaction', args)
    }
    const result = '0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99d05921026d1527331'

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
  },
  eth_sendRawTransaction: async function (args: any, callback: any) {
    const api_name = 'eth_sendRawTransaction'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    const now = Date.now()
    if (verbose) {
      console.log('Sending raw tx to /inject endpoint', new Date(now), now)
      console.log('Running sendRawTransaction', args)
    }
    let nodeUrl: any
    let txHash = ''
    let gasLimit = ''
    try {
      const { isInternalTx } = args[0]
      let tx: any

      if (isInternalTx === true) {
        console.log('We are processing an internal tx')
        tx = args[0]
        txHash = calculateInternalTxHash(tx)
        console.log('Internal tx hash', txHash)
      } else {
        const raw = args[0]
        tx = {
          raw,
        }
        if (config.generateTxTimestamp) tx.timestamp = now
        const transaction = getTransactionObj(tx)

        txHash = bufferToHex(transaction.hash())
        gasLimit = transaction.gasLimit.toString(16)
        const currentTxNonce = transaction.nonce.toNumber()
        const sender = transaction.getSenderAddress().toString()
        let memPoolTx = txMemPool[String(sender)]

        if (config.nonceValidate && memPoolTx && memPoolTx.length > 0) {
          const maxIteration = memPoolTx.length
          let count = 0
          while (count < maxIteration) {
            count++

            if (
              memPoolTx[0].nonce < currentTxNonce &&
              memPoolTx[0].nonce === nonceTracker[String(sender)] + 1
            ) {
              const pendingTx = memPoolTx.shift()
              console.log(`Injecting pending tx in the mem pool`, pendingTx.nonce)
              nodeUrl = injectAndRecordTx(txHash, pendingTx.tx, args)
                .then((res: any) => res.nodeUrl)
                .catch((e: any) => e.nodeUrl)
              nonceTracker[String(sender)] = pendingTx.nonce
              console.log(`Pending tx count for ${sender}: ${txMemPool[sender].length}`)
              await sleep(500)
            }
          }
        }

        const lastTxNonce = nonceTracker[String(sender)]

        if (config.nonceValidate && lastTxNonce && currentTxNonce > lastTxNonce + 1) {
          console.log('BUG: Incorrect tx nonce sequence', lastTxNonce, currentTxNonce)
          if (memPoolTx) {
            memPoolTx.push({ nonce: currentTxNonce, tx })
            memPoolTx = memPoolTx.sort((a: any, b: any) => a.nonce - b.nonce)
          } else {
            memPoolTx = [{ nonce: currentTxNonce, tx }]
          }
          nonceTracker[String(sender)] = currentTxNonce
          return txHash
        }
      }

      injectAndRecordTx(txHash, tx, args)
        .then((res: any) => {
          nodeUrl = res.nodeUrl
          if (res.success === true) {
            logEventEmitter.emit(
              'fn_end',
              ticket,
              {
                nodeUrl: res.nodeUrl,
                success: true,
                reason: res.reason,
                hash: txHash,
              },
              performance.now()
            )
            callback(null, txHash)
          }
          if (res.success !== true && config.adaptiveRejection) {
            logEventEmitter.emit(
              'fn_end',
              ticket,
              {
                nodeUrl: res.nodeUrl,
                success: false,
                reason: res.reason,
                hash: txHash,
              },
              performance.now()
            )
            callback(
              serializeError({ status: res.status }, { fallbackError: { message: res.reason, code: 101 } }),
              null
            )
          }
          return res
        })
        .catch((e) => {
          logEventEmitter.emit(
            'fn_end',
            ticket,
            {
              nodeUrl: e.nodeUrl,
              success: false,
              reason: e.error,
              hash: txHash,
            },
            performance.now()
          )
          callback(e, null)
          return undefined
        })
        .then((res: any) => {
          // Gas cache verification starts here

          // Return if transaction was successful or if cache is disabled
          if (config.gasEstimateUseCache === false) {
            throw new Error('Verification not required: gas cache is disabled')
          }

          // Return if transaction was not injected
          if (!res || res.success !== true) {
            throw new Error('Gas verification error: Unable to determine inject response')
          }

          const transaction = getTransactionObj(tx)
          if (!transaction.to) {
            throw new Error('Gas verification not required: Contract creation transaction')
          }

          return fetchTxReceiptFromArchiver(txHash)
        })
        .then((transaction: any) => {
          if (!transaction?.data?.readableReceipt) {
            throw new Error(`Gas verification error: Unable to fetch transaction receipt for ${txHash}`)
          }

          const readableReceipt = transaction.data.readableReceipt
          if (readableReceipt.status !== 0) {
            throw new Error(`Gas verification not required: Transaction was successful`)
          } else if (readableReceipt.reason === 'out of gas' || readableReceipt.gasUsed === gasLimit) {
            // Remove entry from gasCache
            removeEntry(readableReceipt.to, readableReceipt.data.slice(0, 8))
          }
        })
        .catch((e) => {
          console.log(`Gas verification error: ${e.message}`)
        })
    } catch (e: any) {
      console.log(`Error while injecting tx to consensor`, e)
      logEventEmitter.emit(
        'fn_end',
        ticket,
        {
          nodeUrl,
          success: false,
          reason: e.toString(),
          hash: txHash,
        },
        performance.now()
      )
      callback({ message: e }, null)
    }
  },
  eth_sendInternalTransaction: async function (args: any, callback: any) {
    const api_name = 'eth_sendInternalTransaction'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    const now = Date.now()
    if (verbose) {
      console.log('Sending internal tx to /inject endpoint', new Date(now), now)
      console.log('Running eth_sendInternalTransaction', args)
    }
    const txHash = ''
    try {
      const internalTx = args[0]

      if (config.generateTxTimestamp && internalTx.timestamp == null) internalTx.timestamp = now

      injectAndRecordTx(txHash, internalTx, args)
        .then((res: any) => {
          if (res.success === true) {
            logEventEmitter.emit(
              'fn_end',
              ticket,
              {
                nodeUrl: res.nodeUrl,
                success: true,
                reason: res.reason,
                hash: txHash,
              },
              performance.now()
            )

            callback(null, txHash)
          }
          if (res.success !== true && config.adaptiveRejection) {
            logEventEmitter.emit(
              'fn_end',
              ticket,
              {
                nodeUrl: res.nodeUrl,
                success: false,
                reason: res.reason,
                hash: txHash,
              },
              performance.now()
            )
            callback({ message: 'Internal tx injection failure' }, null)
          }
        })
        .catch((res) => {
          logEventEmitter.emit(
            'fn_end',
            ticket,
            {
              nodeUrl: res.nodeUrl,
              success: false,
              reason: res.error,
              hash: txHash,
            },
            performance.now()
          )
          callback(res.error, null)
        })
    } catch (e) {
      console.log(`Error while injecting tx to consensor`, e)
      logEventEmitter.emit('fn_end', ticket, { nodeUrl: undefined, success: false }, performance.now())
      callback({ message: e }, null)
    }
  },
  eth_call: async function (args: any, callback: any) {
    const api_name = 'eth_call'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_call', args)
    }
    const callObj = args[0]
    //callObj.gasPrice = new BN(0)
    if (!callObj.from || callObj.from === '0x0000000000000000000000000000000000000000') {
      callObj['from'] = '0x2041B9176A4839dAf7A4DcC6a97BA023953d9ad9'
    }
    if (verbose) console.log('callObj', callObj)
    try {
      const res = await requestWithRetry(RequestMethod.Post, `/contract/call`, callObj)
      const nodeUrl = res.data.nodeUrl
      if (verbose) console.log('contract call res.data.result', callObj, nodeUrl, res.data.result)
      if (res.data == null || res.data.result == null) {
        //callback(null, errorHexStatus)
        callback(errorBusy)
        logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: false }, performance.now())
        return
      }
      const result = '0x' + res.data.result
      if (verbose) console.log('eth_call result from', nodeUrl, result)
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
      callback(null, result)
    } catch (e) {
      console.log(`Error while making an eth call`, e)
      //callback(null, errorHexStatus)
      logEventEmitter.emit('fn_end', ticket, { nodeUrl: undefined, success: false }, performance.now())
      callback(errorBusy)
    }
  },
  eth_estimateGas: async function (args: any, callback: any) {
    const api_name = 'eth_estimateGas'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running estimateGas', args)
    }
    // const result = '0x1C9C380' // 30 M gas
    if (config.staticGasEstimate) {
      callback(null, config.staticGasEstimate)
      return
    }

    let result = '0x2DC6C0' // 3 M gas
    try {
      if (!args[0]['to'] && !args[0]['data']) {
        callback(null, result)
        return
      }
      if (args[0]['to'] === '0x0000000000000000000000000000000000000001') {
        // TODO: Calculate according to formula
        callback(null, result)
        return
      }
      if (!args[0]['data']) {
        // Check if receiver is an EOA. If so, return 21000
        const res = await getCode(args[0]['to'])
        if (res.contractCode === '0x') {
          // return 21000
          callback(null, '0x5208')
          return
        }
      }

      const BUFFER = 1.05
      if (
        config.gasEstimateUseCache &&
        checkEntry(args[0]['to'], args[0]['data'].slice(0, 8), config.gasEstimateInvalidationIntervalInMs)
      ) {
        const savedEstimate = getGasEstimate(args[0]['to'], args[0]['data'].slice(0, 8))
        const gasEstimate = hexToBN(savedEstimate.gasEstimate)
        gasEstimate.imuln(BUFFER)
        result = '0x' + gasEstimate.toString(16)
        callback(null, result)
        return
      }

      let originalEstimate = new BN(0)
      if (config.gasEstimateMethod === 'replayEngine') {
        const replayOutput = await replayGas(args[0])
        originalEstimate = hexToBN(replayOutput[0])
      } else if (config.gasEstimateMethod === 'validator') {
        let gasEstimateParam = args[0]
        let res = await requestWithRetry(RequestMethod.Post, `/contract/estimateGas`, gasEstimateParam)

        if (res.data?.estimateGas) {
          originalEstimate = hexToBN(res.data.estimateGas)
        } else if (typeof res.data === 'string' && isHexPrefixed(res.data) && res.data !== '0x') {
          originalEstimate = hexToBN(res.data)
        }
      }

      if (!originalEstimate.isZero()) {
        originalEstimate.imuln(BUFFER)

        if (originalEstimate.gt(MAX_ESTIMATE_GAS)) {
          callback(null, '0x' + MAX_ESTIMATE_GAS.toString('hex'))
          return
        }

        result = '0x' + originalEstimate.toString('hex')

        if (config.gasEstimateUseCache) {
          addEntry({
            contractAddress: args[0]['to'],
            functionSignature: args[0]['data'].slice(0, 8),
            gasEstimate: result,
            timestamp: Date.now(),
          })
        }
      } else {
        console.log('Estimate gas error - gas estimate is zero')
      }
    } catch (e) {
      console.log('Estimate gas error', e)
    }
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
  },
  eth_getBlockByHash: async function (args: any, callback: any) {
    const api_name = 'eth_getBlockByHash'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running getBlockByHash', args)
    }
    //getCurrentBlock handles errors, no try catch needed
    // since there are no transactions included when we query from validator,
    // the transaction_detail_flag is not used
    const res = await requestWithRetry(RequestMethod.Get, `/eth_getBlockByHash?blockHash=${args[0]}`)

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, res.data.block)
  },
  eth_getBlockByNumber: async function (args: any, callback: any) {
    const api_name = 'eth_getBlockByNumber'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running getBlockByNumber', args)
    }
    let blockNumber = args[0]
    // since there are no transactions included when we query from validator,
    // the transaction_detail_flag is not used
    if (blockNumber !== 'latest' && blockNumber !== 'earliest') blockNumber = parseInt(blockNumber, 16)
    const res = await requestWithRetry(RequestMethod.Get, `/eth_getBlockByNumber?blockNumber=${blockNumber}`)
    const nodeUrl = res.data.nodeUrl
    const result = res.data.block
    if (verbose) console.log('BLOCK DETAIL', result)
    callback(null, result)
    logEventEmitter.emit(
      'fn_end',
      ticket,
      { nodeUrl, success: res.data.block ? true : false },
      performance.now()
    )
  },
  eth_getBlockReceipts: async function (args: any, callback: any) {
    const api_name = 'eth_getBlockReceipts'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running getBlockReceipts', args)
    }
    let blockNumber = args[0]
    if (blockNumber !== 'latest' && blockNumber !== 'earliest') blockNumber = parseInt(blockNumber, 16)
    if (blockNumber === 'earliest') blockNumber = 0
    if (config.queryFromExplorer) {
      const explorerUrl = config.explorerUrl
      const res = await axios.get(`${explorerUrl}/api/transaction?blockNumber=${blockNumber}`)
      if (verbose) {
        console.log('url', `${explorerUrl}/api/transaction?blockNumber=${blockNumber}`)
        console.log('res', JSON.stringify(res.data))
      }
      let index = 0
      let result = []
      for (let transaction of res.data.transactions) {
        result.push(extractTransactionReceiptObject(transaction, index))
        index++
      }
      const nodeUrl = config.explorerUrl
      if (verbose) console.log('BLOCK RECEIPTS DETAIL', result)
      callback(null, result)
      logEventEmitter.emit(
        'fn_end',
        ticket,
        { nodeUrl, success: res.data.transactions ? true : false },
        performance.now()
      )
    } else {
      console.log('queryFromExplorer turned off. Could not process request')
      callback(null, [])
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
    }
  },
  eth_feeHistory: async function (args: any, callback: any) {
    const api_name = 'eth_feeHistory'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_feeHistory', args)
    }
    let blockCount = args[0]
    let newestBlock = args[1]
    // technically, the argument "reward" is required
    // since we dont use it, we don't care if someone doesn't include it
    if (
      typeof newestBlock !== 'string' ||
      (newestBlock !== 'earliest' && newestBlock !== 'latest' && !isHex(newestBlock))
    ) {
      const error = {
        message: 'invalid input',
      }
      callback(null, error)
    } else {
      if (blockCount > newestBlock) {
        blockCount = newestBlock
      }
      let result: {
        oldestBlock: string
        baseFeePerGas: any[]
        gasUsedRatio: any[]
        reward: undefined
      }
      result = {
        oldestBlock: '',
        baseFeePerGas: [],
        gasUsedRatio: [],
        reward: undefined,
      }
      if (config.queryFromValidator && config.queryFromExplorer) {
        const explorerUrl = config.explorerUrl
        if (newestBlock === 'earliest') {
          const res = await requestWithRetry(RequestMethod.Get, `/eth_getEarliestBlockNumber`)
          newestBlock = res.data.earliestBlockNumber
        }
        if (newestBlock === 'latest') {
          const res = await requestWithRetry(RequestMethod.Get, `/eth_getLatestBlockNumber`)
          newestBlock = res.data.latestBlockNumber
        }
        for (let i = 0; i < blockCount; i++) {
          let blockNumber = newestBlock - i
          const res = await axios.get(`${explorerUrl}/api/transaction?blockNumber=${blockNumber}`)
          let gasPrices = []
          let gasUsed = 0
          let gasLimit = 0
          for (const transaction of res.data.transactions) {
            console.log('here')

            gasUsed += hexStrToInt(transaction.wrappedEVMAccount.readableReceipt.gasUsed)
            gasLimit += hexStrToInt(transaction.wrappedEVMAccount.readableReceipt.gasLimit)
            gasPrices.push(transaction.wrappedEVMAccount.readableReceipt.gasPrice)
          }
          result.gasUsedRatio.unshift(gasUsed === 0 && gasLimit === 0 ? 0 : gasUsed / gasLimit)
          result.baseFeePerGas.unshift(gasPrices)

          if (blockNumber === newestBlock - blockCount + 1) {
            result.oldestBlock = '0x' + blockNumber.toString(16)
          }
        }
      }
      callback(null, result)
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    }
  },
  eth_getTransactionByHash: async function (args: any, callback: any) {
    const api_name = 'eth_getTransactionByHash'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running getTransactionByHash', args)
    }
    const txHash = args[0]
    let retry = 0
    let success = false
    let result = null
    let nodeUrl
    while (retry < 10 && !success) {
      try {
        let res
        if (config.queryFromValidator) {
          res = await requestWithRetry(RequestMethod.Get, `/tx/${txHash}`)
          nodeUrl = res.data.nodeUrl
          result = res.data.account
          if (res.data && res.data.error) {
            if (verbose) console.log(`eth_getTransactionReceipt from validator error: ${res.data.error} `)
          }
        }
        // set node url to null in this block, because querying from node fail
        // and now trying to get it from other sources
        nodeUrl = null
        if (!result && config.queryFromArchiver) {
          if (verbose) console.log('querying eth_getTransactionByHash from archiver ', txHash)
          res = await axios.get(`${getArchiverUrl().url}/transaction?accountId=${txHash.substring(2)}`)
          result = res.data.transactions?.data
        }
        if (!result && config.queryFromExplorer) {
          if (verbose) console.log('querying eth_getTransactionByHash from explorer', txHash)
          const explorerUrl = config.explorerUrl
          res = await axios.get(`${explorerUrl}/api/transaction?txHash=${txHash}`)
          if (verbose)
            console.log(
              'url',
              `${explorerUrl}/api/transaction?txHash=${txHash}`,
              'res',
              JSON.stringify(res.data)
            )
          result = res.data.transactions ? res.data.transactions[0] : null
        }
        if (result === null) {
          await sleep(200)
          retry += 1
          continue
        }

        success = true
      } catch (e) {
        if (verbose) console.log('Error: eth_getTransactionByHash', e)
        retry += 1
        await sleep(200)
      }
    }
    if (!result) {
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      callback(null, null) // tx not found
      return
    }

    result = extractTransactionObject(result)
    if (verbose) console.log('Final Tx:', txHash, result)
    logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
    callback(null, result)
  },
  eth_getTransactionByBlockHashAndIndex: async function (args: any, callback: any) {
    const api_name = 'eth_getTransactionByBlockHashAndIndex'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_getTransactionByBlockHashAndIndex', args)
    }
    let blockHash = args[0]
    const index = parseInt(args[1], 16)
    //if (blockHash !== 'latest') blockHash = parseInt(blockHash, 16)
    if (config.queryFromValidator && config.queryFromExplorer) {
      const explorerUrl = config.explorerUrl
      if (blockHash === 'latest') {
        const res = await requestWithRetry(RequestMethod.Get, `/eth_getLatestBlockHash`)
        console.log(`res is ${res}`)
        blockHash = res.data.latestBlockHash
      }
      const res = await axios.get(`${explorerUrl}/api/transaction?blockHash=${blockHash}`)
      if (verbose) {
        console.log('url', `${explorerUrl}/api/transaction?blockHash=${blockHash}`)
        console.log('res', JSON.stringify(res.data))
      }

      let result = extractTransactionObject(res.data.transactions[index], index)

      const nodeUrl = config.explorerUrl
      if (verbose) console.log('TRANSACTION DETAIL', result)
      callback(null, result)
      logEventEmitter.emit(
        'fn_end',
        ticket,
        { nodeUrl, success: res.data.transactions.length ? true : false },
        performance.now()
      )
    } else {
      console.log('queryFromValidator and/or queryFromExplorer turned off. Could not process request')
      callback(null, [])
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    }
  },
  eth_getTransactionByBlockNumberAndIndex: async function (args: any, callback: any) {
    const api_name = 'eth_getTransactionByBlockNumberAndIndex'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_getTransactionByBlockNumberAndIndex', args)
    }
    let blockNumber = args[0]
    const index = parseInt(args[1], 16)
    if (blockNumber !== 'latest' && blockNumber !== 'earliest') blockNumber = parseInt(blockNumber, 16)
    if (blockNumber === 'earliest') blockNumber = 0
    if (config.queryFromExplorer) {
      const explorerUrl = config.explorerUrl
      const res = await axios.get(`${explorerUrl}/api/transaction?blockNumber=${blockNumber}`)
      if (verbose) {
        console.log('url', `${explorerUrl}/api/transaction?blockNumber=${blockNumber}`)
        console.log('res', JSON.stringify(res.data))
      }

      let result = extractTransactionObject(res.data.transactions[index], index)

      const nodeUrl = config.explorerUrl
      if (verbose) console.log('TRANSACTION DETAIL', result)
      callback(null, result)
      logEventEmitter.emit(
        'fn_end',
        ticket,
        { nodeUrl, success: res.data.transactions.length ? true : false },
        performance.now()
      )
    } else {
      console.log('queryFromExplorer turned off. Could not process request')
      callback(null, [])
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    }
  },
  eth_getTransactionReceipt: async function (args: any, callback: any) {
    const api_name = 'eth_getTransactionReceipt'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    const now = Date.now()
    if (verbose) console.log('Getting tx receipt', new Date(now), now, 'args', args)
    let nodeUrl
    try {
      let res
      let result
      const txHash = args[0]
      if (config.queryFromValidator) {
        res = await requestWithRetry(RequestMethod.Get, `/tx/${txHash}`)
        if (!result && res.data && res.data.error) {
          if (verbose) console.log(`eth_getTransactionReceipt from validator error: ${res.data.error} `)
        }
        nodeUrl = res.data?.nodeUrl
        result = res.data?.account
      }
      if (!result && config.queryFromArchiver) {
        if (verbose) console.log('querying eth_getTransactionReceipt from archiver')

        res = await axios.get(`${getArchiverUrl().url}/transaction?accountId=${txHash.substring(2)}`)
        if (verbose) {
          console.log('url', `${getArchiverUrl().url}/transaction?accountId=${txHash.substring(2)}`)
          console.log('res', JSON.stringify(res.data))
        }

        result = res.data.transactions ? res.data.transactions.data : null
      } else if (!result && config.queryFromExplorer) {
        console.log('querying eth_getTransactionReceipt from explorer', txHash)
        const explorerUrl = config.explorerUrl
        res = await axios.get(`${explorerUrl}/api/transaction?txHash=${txHash}`)
        /* prettier-ignore */ if (verbose) console.log('url', `${explorerUrl}/api/transaction?txHash=${txHash}`,'res', JSON.stringify(res.data))

        result = res.data.transactions ? res.data.transactions[0] : null
      }
      if (result) {
        result = extractTransactionReceiptObject(result)
        if (verbose) console.log(`getTransactionReceipt result for ${txHash}`, result)
      }
      callback(null, result)
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
    } catch (e) {
      console.log('Unable to eth_getTransactionReceipt', e)
      //callback(null, errorHexStatus)
      callback(errorBusy)
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    }
  },
  eth_getUncleByBlockHashAndIndex: async function (args: any, callback: any) {
    const api_name = 'eth_getUncleByBlockHashAndIndex'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running getUncleByBlockHashAndIndex', args)
    }
    const result = null
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_getUncleByBlockNumberAndIndex: async function (args: any, callback: any) {
    const api_name = 'eth_getUncleByBlockNumberAndIndex'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running getUncleByBlockNumberAndIndex', args)
    }
    const result = null
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_getCompilers: async function (args: any, callback: any) {
    const api_name = 'eth_getCompilers'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running getCompilers', args)
    }
    const result = ['solidity', 'lll', 'serpent']
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_compileSolidity: async function (args: any, callback: any) {
    const api_name = 'eth_compileSolidity'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running compileSolidity', args)
    }
    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_compileLLL: async function (args: any, callback: any) {
    const api_name = 'eth_compileLLL'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_compileSerpent: async function (args: any, callback: any) {
    const api_name = 'eth_compileSerpent'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_newBlockFilter: async function (args: any, callback: any) {
    const api_name = 'eth_newBlockFilter'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const currentBlock = await getCurrentBlock()
    const filterId = getFilterId()
    const filterObj: Types.BlockFilter = {
      id: filterId,
      lastQueriedTimestamp: Date.now(),
      lastQueriedBlock: parseInt(currentBlock.number.toString()),
      createdBlock: parseInt(currentBlock.number.toString()),
    }
    const unsubscribe = () => {}
    const internalFilter: Types.InternalFilter = {
      updates: [],
      filter: filterObj,
      unsubscribe,
      type: Types.FilterTypes.block,
    }
    filtersMap.set(filterId.toString(), internalFilter)

    callback(null, filterId)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_newPendingTransactionFilter: async function (args: any, callback: any) {
    const api_name = 'eth_newPendingTransactionFilter'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running newPendingTransactionFilter', args)
    }

    const currentBlock = await getCurrentBlock()
    const filterId = getFilterId()
    const filterObj: Types.PendingTransactionFilter = {
      id: filterId,
      lastQueriedTimestamp: Date.now(),
      lastQueriedBlock: parseInt(currentBlock.number.toString()),
      createdBlock: parseInt(currentBlock.number.toString()),
    }
    const unsubscribe = () => {}
    const internalFilter: Types.InternalFilter = {
      updates: [],
      filter: filterObj,
      unsubscribe,
      type: Types.FilterTypes.pendingTransaction,
    }
    filtersMap.set(filterId.toString(), internalFilter)

    callback(null, filterId)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_uninstallFilter: async function (args: any, callback: any) {
    const api_name = 'eth_uninstallFilter'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    let filterId = args[0]
    let internalFilter = filtersMap.get(filterId)
    if (internalFilter == null) {
      callback(null, false)
      return
    }

    internalFilter.unsubscribe()
    filtersMap.delete(filterId)

    callback(null, true)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_newFilter: async function (args: any, callback: any) {
    const api_name = 'eth_newFilter'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    let inputFilter = args[0]

    if (inputFilter == null) {
      callback(null, null)
      return
    }
    const { address, topics } = parseFilterDetails(inputFilter || {})
    const currentBlock = await getCurrentBlock()
    const filterId = getFilterId()
    let filterObj: Types.LogFilter = {
      id: filterId,
      address: address,
      topics,
      fromBlock: inputFilter.fromBlock,
      toBlock: inputFilter.toBlock,
      lastQueriedTimestamp: Date.now(),
      lastQueriedBlock: parseInt(currentBlock.number.toString()),
      createdBlock: parseInt(currentBlock.number.toString()),
    }
    if (filterObj.fromBlock === 'latest') filterObj.fromBlock = lastBlockInfo.blockNumber
    if (filterObj.toBlock === 'latest') delete filterObj.toBlock
    const unsubscribe = () => {}
    const internalFilter: Types.InternalFilter = {
      updates: [],
      filter: filterObj,
      unsubscribe,
      type: Types.FilterTypes.log,
    }
    filtersMap.set(filterId.toString(), internalFilter)

    callback(null, filterId)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_getFilterChanges: async function (args: any, callback: any) {
    const api_name = 'eth_getFilterChanges'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    let filterId = args[0]

    const internalFilter: Types.InternalFilter | undefined = filtersMap.get(filterId.toString())
    let updates = []
    if (internalFilter && internalFilter.type === Types.FilterTypes.log) {
      let logFilter = internalFilter.filter as Types.LogFilter
      let request: Types.LogQueryRequest = {
        address: logFilter.address,
        topics: logFilter.topics,
        fromBlock: String(logFilter.lastQueriedBlock + 1),
      }
      console.log('filter changes request', request)
      updates = await getLogsFromExplorer(request)
      internalFilter.updates = []
      let currentBlock = await getCurrentBlock()
      // this could potentially have issue because explorer server is a bit behind validator in terms of tx receipt or block number
      logFilter.lastQueriedBlock = parseInt(currentBlock.number.toString())
      logFilter.lastQueriedTimestamp = Date.now()
    } else if (internalFilter && internalFilter.type === Types.FilterTypes.block) {
      let blockFilter = internalFilter.filter as Types.BlockFilter
      const url = `/eth_getBlockHashes?fromBlock=${blockFilter.lastQueriedBlock + 1}`
      const res = await requestWithRetry(RequestMethod.Get, url)
      if (res.data && res.data.blockHashes) {
        updates = res.data.blockHashes
        blockFilter.lastQueriedBlock = res.data.toBlock
        blockFilter.lastQueriedTimestamp = Date.now()
      }
    } else if (internalFilter && internalFilter.type === Types.FilterTypes.pendingTransaction) {
      try {
        // fetch pending transaction hashes from explorer and return them
        let pendingTransactionHashes = await getExplorerPendingTransactions()

        internalFilter.updates = pendingTransactionHashes
        // Fetch the current block info
        const { blockNumber } = await getCurrentBlockInfo()
        // Update the last queried block and timestamp of the filter
        internalFilter.filter.lastQueriedBlock = parseInt(blockNumber)
        internalFilter.filter.lastQueriedTimestamp = Date.now()
        // Emit events for the new transactions and updated filter
        logEventEmitter.emit(`pendingTransactions`, pendingTransactionHashes)
        logEventEmitter.emit(`pendingTransactions_${filterId}`, internalFilter)
        // Assign the updates to the updates variable and clear the updates in the filter
        updates = internalFilter.updates
        internalFilter.updates = [] // clear the updates after retrieving them
      } catch (error) {
        console.error(`eth_getFilterChanges: error fetching pending transactions from explorer: ${error}`)
      }
    } else {
      // throw new Error("filter not found");
      console.error(`eth_getFilterChanges: filter not found: ${filterId}`)
    }

    if (config.verbose)
      console.log(
        `eth_getFilterChanges: filterId: ${filterId}, updates: ${updates.length}`,
        internalFilter,
        updates
      )

    callback(null, updates)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_getFilterLogs: async function (args: any, callback: any) {
    const api_name = 'eth_getFilterLogs'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    let filterId = args[0]
    let logs = []

    const internalFilter: Types.InternalFilter | undefined = filtersMap.get(filterId.toString())
    if (internalFilter && internalFilter.type === Types.FilterTypes.log) {
      let logFilter = internalFilter.filter as Types.LogFilter
      let request: Types.LogQueryRequest = {
        address: logFilter.address,
        topics: logFilter.topics,
        fromBlock: String(logFilter.createdBlock),
      }
      if (logFilter.fromBlock) {
        request.fromBlock = String(logFilter.fromBlock)
      }
      logs = await getLogsFromExplorer(request)
    } else {
      console.error(`eth_getFilterChanges: filter not found: ${filterId}`)
    }

    if (config.verbose) console.log(`eth_getFilterLogs: filterId: ${filterId}`, logs)

    callback(null, logs)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_getLogs: async function (args: any, callback: any) {
    const api_name = 'eth_getLogs'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running getLogs', args)
    }
    let request = args[0]
    let logs = []
    if (request.fromBlock === 'earliest') {
      request.fromBlock = '0'
    }
    if (request.fromBlock === 'latest') {
      if (lastBlockInfo && lastBlockInfo.blockNumber) {
        request.fromBlock = lastBlockInfo.blockNumber
      } else {
        try {
          let { blockNumber } = await getCurrentBlockInfo()
          request.fromBlock = blockNumber
        } catch (e) {
          console.error(`eth_getLogs: failed to get current block`, e)
          callback(null, new Error(`eth_getLogs: failed to get current block`))
          logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
          return
        }
      }
    }
    if (request.toBlock === 'latest') {
      if (lastBlockInfo && lastBlockInfo.blockNumber !== '0x0') {
        request.toBlock = lastBlockInfo.blockNumber
      } else {
        try {
          let { blockNumber } = await getCurrentBlockInfo()
          request.toBlock = blockNumber
        } catch (e) {
          console.error(`eth_getLogs: failed to get current block`, e)
          callback(null, new Error(`eth_getLogs: failed to get current block`))
          logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
          return
        }
      }
    }
    if (request.blockHash) {
      const res = await requestWithRetry(
        RequestMethod.Get,
        `/eth_getBlockByHash?blockHash=${request.blockHash}`
      )
      if (res.data && res.data.block) {
        request.fromBlock = res.data.block.number
        request.toBlock = res.data.block.number
      }
    }
    logs = await getLogsFromExplorer(request)
    callback(null, logs)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_getWork: async function (args: any, callback: any) {
    const api_name = 'eth_getWork'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_submitWork: async function (args: any, callback: any) {
    const api_name = 'eth_submitWork'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_submitHashrate: async function (args: any, callback: any) {
    const api_name = 'eth_submitHashrate'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  debug_traceTransaction: async function (args: any, callback: any) {
    const api_name = 'debug_traceTransaction'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now(), args[0], args[1])
    if (verbose) {
      console.log('Running debug_traceTransaction', args)
    }

    // Check if tracer is defined
    if (args[1] && args[1].tracer) {
      callback({ code: errorCode, message: 'Only the default opcode tracer is supported' })
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      return
    }

    try {
      const result = await replayTransaction(args[0], '-s')
      callback(null, { structLogs: result })
    } catch (e) {
      console.log(`Error while making an eth call`, e)
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      callback(errorBusy)
    }
  },
  debug_storageRangeAt: async function (args: any, callback: any) {
    const api_name = 'debug_storageRangeAt'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit(
      'fn_start',
      ticket,
      api_name,
      performance.now(),
      args[0],
      args[1],
      args[2],
      args[3],
      args[4]
    )
    if (verbose) {
      console.log('Running debug_storageRangeAt', args)
    }

    // Fetch blockNumber by using eth_getBlockByHash
    const res = await requestWithRetry(RequestMethod.Get, `/eth_getBlockByHash?blockHash=${args[0]}`)
    const blockNumber = res.data.block.number

    const request: Types.LogQueryRequest = {
      address: args[2],
      fromBlock: blockNumber,
    }
    const logs = await getLogsFromExplorer(request)
    console.log('THE LOGS ARE', logs)
    callback(null, { storage: {} })
  },
  debug_storageRangeAt2: async function (args: any, callback: any) {
    const api_name = 'debug_storageRangeAt2'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now(), args[0], args[1], args[2], args[3])
    if (verbose) {
      console.log('Running debug_storageRangeAt2', args)
    }

    try {
      const txHash = args[0]
      const states = await fetchStorage(txHash)
      const storageObject: { [key: string]: any } = {}
      states.forEach((state) => {
        const keyBuf = parseAndValidateStringInput(state.key)
        const keyHash = keccak256(Buffer.from(keyBuf.buffer, keyBuf.byteOffset, keyBuf.length))
        storageObject[bufferToHex(keyHash)] = state
      })
      callback(null, { storage: storageObject })
    } catch (e) {
      console.log(`Error while making an eth call`, e)
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      callback(errorBusy)
    }
  },
  db_putString: async function (args: any, callback: any) {
    const api_name = 'db_putString'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  db_getString: async function (args: any, callback: any) {
    const api_name = 'db_getString'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  db_putHex: async function (args: any, callback: any) {
    const api_name = 'db_putHex'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  db_getHex: async function (args: any, callback: any) {
    const api_name = 'db_getHex'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_version: async function (args: any, callback: any) {
    const api_name = 'shh_version'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_post: async function (args: any, callback: any) {
    const api_name = 'shh_post'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_newIdentity: async function (args: any, callback: any) {
    const api_name = 'shh_newIdentity'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_hasIdentity: async function (args: any, callback: any) {
    const api_name = 'shh_hasIdentity'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_newGroup: async function (args: any, callback: any) {
    const api_name = 'shh_newGroup'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_addToGroup: async function (args: any, callback: any) {
    const api_name = 'shh_addToGroup'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_newFilter: async function (args: any, callback: any) {
    const api_name = 'shh_newFilter'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_uninstallFilter: async function (args: any, callback: any) {
    const api_name = 'shh_uninstallFilter'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_getFilterChanges: async function (args: any, callback: any) {
    const api_name = 'shh_getFilterChanges'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_getMessages: async function (args: any, callback: any) {
    const api_name = 'shh_getMessages'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_chainId: async function (args: any, callback: any) {
    const api_name = 'eth_chainId'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    if (verbose) {
      console.log('Running eth_chainId', args)
    }
    const chainId = `${config.chainId}`
    const hexValue = '0x' + parseInt(chainId, 10).toString(16)
    callback(null, hexValue)
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_getAccessList: async function (args: any, callback: any) {
    const api_name = 'eth_getAccessList'
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    console.log('Running eth_getAccessList', args)

    const callObj = args[0]
    if (!callObj.from) {
      callObj['from'] = '0x2041B9176A4839dAf7A4DcC6a97BA023953d9ad9'
    }
    console.log('callObj', callObj)

    let nodeUrl
    try {
      const res = await requestWithRetry(RequestMethod.Post, `/contract/accesslist`, callObj)
      nodeUrl = res.data.nodeUrl
      if (verbose) console.log('contract eth_getAccessList res.data', callObj, res.data.nodeUrl, res.data)
      if (res.data == null || res.data.accessList == null) {
        logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
        callback(errorBusy)
        return
      }
      if (verbose)
        console.log('predicted accessList from', res.data.nodeUrl, JSON.stringify(res.data.accessList))
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
      callback(null, res.data.accessList)
    } catch (e) {
      console.log(`Error while making an eth call`, e)
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      callback(errorBusy)
    }
  },
  eth_subscribe: async function (args: any, callback: any) {
    if (!CONFIG.websocket.enabled || !CONFIG.websocket.serveSubscriptions) {
      callback('Subscription feature disabled', null)
      return
    }
    try {
      const subscription_name = args[0]
      const filters = args[1]
      const sub_id = args[10]
      if (subscription_name !== 'logs') {
        logSubscriptionList.removeById(args[10])
        callback('Shardeum only support logs subscriptions', null)
        return
      }
      if (!filters.address && !filters.topics) {
        logSubscriptionList.removeById(args[10])
        callback('Invalid Filters', null)
        return
      }
      if (!sub_id) {
        throw new Error('Subscription id missing, internal server Error')
      }

      const payload = {
        subscription_id: sub_id,
        address: filters.address,
        topics: filters.topics,
        ipport: ipport,
      }
      if (evmLogProvider_ConnectionStream === null) {
        throw new Error('RPC cannot established connection to evm log provider')
      }
      subscriptionEventEmitter.emit('evm_log_subscribe', payload)
    } catch (e: any) {
      logSubscriptionList.removeById(args[10])
      callback(e.message, null)
      // subscription failed, will not be tracking it
    }
  },

  eth_unsubscribe: async function (args: any, callback: any) {
    if (!CONFIG.websocket.enabled || !CONFIG.websocket.serveSubscriptions) {
      callback('Subscription feature disabled', null)
      return
    }
    try {
      const subscription_id: string = args[0]
      const socket: WebSocket.WebSocket = args[10]

      if (!logSubscriptionList.getById(subscription_id)) {
        throw new Error('Subscription not found')
      }

      // this mean client is trying to unsubscribe someone else's subscription
      if (logSubscriptionList.getById(subscription_id)?.socket !== socket) {
        throw new Error('Subscription not found')
      }
      subscriptionEventEmitter.emit('evm_log_unsubscribe', subscription_id)
    } catch (e: any) {
      callback(e.message, null)
      // subscription failed, will not be tracking it
    }
  },
}
