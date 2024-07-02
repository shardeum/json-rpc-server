import axios, { AxiosError } from 'axios'
import WebSocket from 'ws'
import { serializeError } from 'eth-rpc-errors'
import { BN, bufferToHex, isHexPrefixed, isHexString, isValidAddress, keccak256 } from 'ethereumjs-util'
import {
  calculateInternalTxHash,
  getAccountFromValidator,
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
  calculateContractStorageAccountId,
  getSyncTime,
  removeFromNodeList,
} from './utils'
import crypto from 'crypto'
import { logEventEmitter } from './logger'
import { CONFIG, CONFIG as config } from './config'
import { logSubscriptionList } from './websocket/clients'
import { ipport } from './server'
import { subscriptionEventEmitter } from './websocket'
import { evmLogProvider_ConnectionStream } from './websocket/log_server'
import * as Types from './types'
import { addEntry, checkEntry, getGasEstimate, removeEntry } from './service/gasEstimate'
import { collectorAPI } from './external/Collector'
import { serviceValidator } from './external/ServiceValidator'
import { JSONRPCCallbackTypePlain, RequestParamsLike, JSONRPCError } from 'jayson'
import { readableBlock, completeReadableReceipt, readableTransaction } from './external/Collector'
import { OriginalTxData, TransactionFromArchiver } from './types'
import { isErr } from './external/Err'
import { bytesToHex, toBytes } from '@ethereumjs/util'
import { RLP } from '@ethereumjs/rlp'
import { nestedCountersInstance } from './utils/nestedCounters'
import { trySpendServicePoints } from './utils/servicePoints'

export const verbose = config.verbose
export const firstLineLogs = config.firstLineLogs
export const verboseAALG = config.verboseAALG
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
const txMemPool: {
  [key: string]: { nonce: number; tx: TransactionData }[]
} = {}
const nonceTracker: {
  [key: string]: number
} = {}
let totalResult = 0
let nonceFailCount = 0
let precrackFail = 0

type InjectResponse = {
  success: boolean
  reason: string
  status: number
}

export type TxStatus = {
  txHash: string
  raw?: string
  injected: boolean
  // TODO: double check with team
  accepted: TxStatusCode | boolean
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
  accepted:
    | TxStatusCode.BAD_TX
    | TxStatusCode.SUCCESS
    | TxStatusCode.BUSY
    | TxStatusCode.OTHER_FAILURE
    | boolean
  reason: string
  timestamp: string
  nodeUrl?: string
}

type JsonValue = string | number | boolean | null | undefined | JsonValue[] | { [key: string]: JsonValue }

// [] ask about this with Thant
type TransactionData = {
  raw?: string
  sign?: string
  tag?: string
  tx?: string | { [key: string]: JsonValue }
  timestamp?: number
  [key: string]: JsonValue
}

interface TransactionInjectionOutcome {
  nodeUrl: string
  success: boolean
  reason: string
  status: number
}

function hexStrToInt(hexStr: string): number {
  if (!isHex(hexStr)) {
    return 0
  }
  return parseInt(hexStr.slice(2), 16)
}

function isHex(str: string) {
  const regexp = /^(0x|0X)[0-9a-fA-F]+$/
  return regexp.test(str)
}

function isHexOrEmptyHex(str: string) {
  return str == '0x' || isHex(str)
}

// Utility function to ensure arguments are an array
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureArrayArgs(args: RequestParamsLike, callback: JSONRPCCallbackTypePlain): args is any[] {
  if (!Array.isArray(args)) {
    const error: JSONRPCError = {
      code: -32602, // JSON-RPC error code for invalid params
      message: 'Invalid params: non-array args',
    }
    callback(error, null)
    return false
  }
  return true
}

const filtersMap: Map<string, Types.InternalFilter> = new Map()

type Tx = readableTransaction & {
  timestamp: number
  gasUsed: string
  gasRefund: string
  transactionHash?: string
  data?: string
  logs?: string[]
  logsBloom?: string
  cumulativeGasUsed?: string
  contractAddress?: string
  status?: string | number
  transactionType?: string | number
  gasLimit: string
}

type TxParam =
  | {
      readableReceipt: Tx
      txHash?: string
      transactionType?: string | number
    }
  | {
      wrappedEVMAccount: {
        readableReceipt: Tx
        txHash: string
      }
    }

function extractTransactionObject(
  bigTransaction: TxParam,
  transactionIndexArg?: number
): readableTransaction | null {
  if (bigTransaction) {
    const tx = 'wrappedEVMAccount' in bigTransaction ? bigTransaction.wrappedEVMAccount : bigTransaction
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
      hash: tx.txHash || tx.readableReceipt.transactionHash || '',
      input: tx.readableReceipt.data || '',
      nonce: tx.readableReceipt.nonce,
      to: tx.readableReceipt.to,
      transactionIndex: transactionIndexArg
        ? '0x' + transactionIndexArg.toString(16)
        : tx.readableReceipt.transactionIndex,
      value: tx.readableReceipt.value,
      type: tx.readableReceipt.type,
      chainId: tx.readableReceipt.chainId,
      v: tx.readableReceipt.v,
      r: tx.readableReceipt.r,
      s: tx.readableReceipt.s,
    }
  }

  return null
}
async function getFromBlockInput(fromBlock: string) {
  if (fromBlock == null || fromBlock === '' || fromBlock === 'earliest') {
    return '0x0'
  }
  if (fromBlock === 'latest') {
    if (CONFIG.collectorSourcing.enabled) {
      const block = await collectorAPI.getBlock('latest', 'tag')
      return block?.number
    } else {
      const block = await getCurrentBlockInfo()
      return block?.blockNumber
    }
  }
  if (!isHex(fromBlock) || !parseInt(fromBlock, 16)) {
    return null
  }
  return fromBlock
}
async function getToBlockInput(toBlock: string) {
  if (toBlock == null || toBlock === '' || toBlock === 'latest') {
    if (CONFIG.collectorSourcing.enabled) {
      const block = await collectorAPI.getBlock('latest', 'tag')
      return block?.number
    } else {
      const block = await getCurrentBlockInfo()
      return block?.blockNumber
    }
  }
  if (!isHex(toBlock) || !parseInt(toBlock, 16)) {
    return null
  }
  return toBlock
}
function checkValidHexTopics(topics: any[]) {
  let flattenTopics = topics.reduce((accumulator, value) => accumulator.concat(value), [])
  for (var flattenTopic of flattenTopics) {
    if (flattenTopic && !isHex(flattenTopic)) {
      return false
    }
  }
  return true
}
interface ReceiptObject {
  blockHash: string
  blockNumber: string
  contractAddress?: string
  cumulativeGasUsed?: string
  effectiveGasPrice: string
  from: string
  gasUsed: string
  logs?: string[]
  logsBloom?: string
  status?: string
  to: string
  transactionHash?: string
  transactionIndex: string
  type?: string
}

function extractTransactionReceiptObject(
  bigTransaction: TxParam,
  transactionIndexArg?: number
): ReceiptObject | null {
  if (bigTransaction) {
    const tx = 'wrappedEVMAccount' in bigTransaction ? bigTransaction.wrappedEVMAccount : bigTransaction

    const txType = 'transactionType' in bigTransaction ? bigTransaction.transactionType : undefined

    return {
      blockHash: tx.readableReceipt.blockHash,
      blockNumber: tx.readableReceipt.blockNumber,
      contractAddress: tx.readableReceipt.contractAddress,
      cumulativeGasUsed:
        tx.readableReceipt.cumulativeGasUsed === '0x'
          ? tx.readableReceipt.gasLimit
          : tx.readableReceipt.cumulativeGasUsed,
      effectiveGasPrice: tx.readableReceipt.gasPrice,
      from: tx.readableReceipt.from,
      gasUsed: tx.readableReceipt.gasUsed === '0x' ? tx.readableReceipt.gasLimit : tx.readableReceipt.gasUsed,
      logs: tx.readableReceipt.logs || [],
      logsBloom:
        tx.readableReceipt.logsBloom ||
        '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      status:
        typeof tx.readableReceipt.status === 'number'
          ? '0x' + tx.readableReceipt.status.toString(16)
          : tx.readableReceipt.status,
      to: tx.readableReceipt.to,
      transactionHash: tx.txHash || tx.readableReceipt.transactionHash,
      transactionIndex: transactionIndexArg
        ? '0x' + transactionIndexArg.toString(16)
        : tx.readableReceipt.transactionIndex,
      type: typeof txType === 'number' ? '0x' + txType.toString(16) : txType,
    }
  }

  return null
}

export function buildLogAPIUrl(request: Types.LogQueryRequest, baseDomain = config.explorerUrl): string {
  const apiUrl = `${baseDomain}/api/log`
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

interface LogItem {
  log: string
}

async function getLogsFromExplorer(request: Types.LogQueryRequest): Promise<string[]> {
  let updates: string[] = []
  let currentPage = 1

  try {
    if (request == null) return []
    const baseUrl = buildLogAPIUrl(request)
    const fullUrl = baseUrl + `&page=${currentPage}`
    if (config.verbose) console.log(`getLogsFromExplorer fullUrl: ${fullUrl}`)
    let res = await axios.get(fullUrl)

    if (res.data && res.data.success && res.data.logs.length > 0) {
      const logs = res.data.logs.map((item: LogItem) => item.log)
      updates = updates.concat(logs)
      currentPage += 1
      const totalPages = res.data.totalPages
      while (currentPage <= totalPages) {
        res = await axios.get(`${baseUrl}&page=${currentPage}`)
        if (res.data && res.data.success) {
          const logs = res.data.logs.map((item: LogItem) => item.log)
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

interface BlockInfo {
  blockNumber: string
  timestamp: string
  nodeUrl?: string
}

async function getCurrentBlockInfo(): Promise<BlockInfo> {
  /* prettier-ignore */ if (firstLineLogs) console.log('Running getCurrentBlockInfo')
  let result: BlockInfo = { ...lastBlockInfo, nodeUrl: undefined }

  try {
    if (verbose) console.log('Querying getCurrentBlockInfo from validator')
    const res = await requestWithRetry(RequestMethod.Get, `/eth_blockNumber`)
    const blockNumber = res.data.blockNumber
    const timestamp = Date.now()
    result = {
      nodeUrl: res.data.nodeUrl,
      blockNumber: blockNumber,
      timestamp: intStringToHex(String(timestamp)),
    }
    lastBlockInfo = { ...result }
    return result
  } catch (e) {
    console.log('Unable to get cycle number', e)
  }
  return result
}

interface CurrentBlockInfo extends readableBlock {
  nodeUrl: string | undefined
}

async function getCurrentBlock(): Promise<CurrentBlockInfo> {
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
  /* prettier-ignore */ if (firstLineLogs) { console.log('Running getcurrentBlock', blockNumber, timestamp) }
  const result: CurrentBlockInfo = {
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

  return result
}

async function getExplorerPendingTransactions(): Promise<string[]> {
  const explorerURL = config.explorerUrl
  const txHashes: string[] = []
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

export function createRejectTxStatus(txHash: string, reason: string, ip: string, nodeUrl?: string): void {
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

export function recordTxStatus(txStatus: TxStatus): void {
  txStatuses.push(txStatus)
  if (txStatuses.length > maxTxCountToStore && config.recordTxStatus) {
    saveTxStatus()
  }
}

async function injectWithRetries(txHash: string, tx: any, args: any, retries = config.defaultRequestRetry) {
  let result: TransactionInjectionOutcome
  let retryCount = 0
  while (retryCount < retries) {
    result = await injectAndRecordTx(txHash, tx, args)
    if (result.success) {
      return result
    } else if (result.reason === 'Node is too close to rotation edges. Inject to another node') {
      console.log('Node is close to rotation edges. Rotating node...')
      if (result.nodeUrl) {
        const urlParts = result.nodeUrl.split(':')
        removeFromNodeList(urlParts[0], urlParts[1])
      }
      retryCount++
    } else if (result.reason === 'Node not active. Rejecting inject.') {
      console.log('Injected to an inactive node. Retrying...')
      retryCount++
    } else if (result.reason === 'Node not found. Rejecting inject') {
      console.log('Injected to an unknown node. Retrying...')
      retryCount++
    } else if (result.reason === 'No validators found to forward the transaction') {
      console.log('No validators found to forward the transaction. Retrying...')
      retryCount++
    } else {
      return result
    }
  }
  return {
    nodeUrl: '',
    success: false,
    reason: 'Failed to inject transaction after retries',
    status: 500,
  }
}

async function injectAndRecordTx(
  txHash: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any
): Promise<{
  nodeUrl: string
  success: boolean
  reason: string
  status: number
}> {
  const { raw } = tx
  const { baseUrl } = getBaseUrl()
  totalResult += 1
  const startTime = Date.now()

  let warmupList: any = null
  let usingWarmup = false
  if (config.aalgWarmup) {
    const pointPermitWarmup = trySpendServicePoints('aalg-warmup')

    if (pointPermitWarmup === true) {
      // get access list to use as warmupdata
      let nodeUrl
      let accessListResp = null
      try {
        const callObj = tx
        const res = await requestWithRetry(RequestMethod.Post, `/contract/accesslist`, callObj)
        nodeUrl = res.data.nodeUrl
        if (verboseAALG && verbose)
          console.log('warmup-access-list eth_getAccessList res.data', callObj, res.data.nodeUrl, res.data)
        if (res.data == null || res.data.accessList == null) {
          countFailedResponse('warmup-access-list', 'no accessList')
          if (verboseAALG) console.log('warmup-access-list', 'no accessList', txHash)
        } else {
          accessListResp = res.data
          if (verboseAALG)
            console.log(
              `inject: predicted accessList for ${txHash} from`,
              res.data.nodeUrl,
              JSON.stringify(res.data.accessList, null, 2)
            )
          countSuccessResponse('warmup-access-list', 'success TBD')
        }
      } catch (e: any) {
        if (verboseAALG) console.log(`Error while making an eth call `, e.message)
        countFailedResponse('warmup-access-list', 'exception in /contract/accesslist')
        if (verboseAALG) console.log('warmup-access-list', 'exception in /contract/accesslist', e, txHash)
      }

      if (accessListResp != null) {
        warmupList = { accessList: accessListResp.accessList, codeHashes: accessListResp.codeHashes }
        usingWarmup = true
        if (verboseAALG) {
          console.log('warmup-access-list', txHash, 'req duration', Date.now() - startTime)
          if (verbose) console.log('warmup-access-list accessList: ', JSON.stringify(accessListResp, null, 2))
          if (verbose) console.log('warmup-access-list warmupList: ', JSON.stringify(warmupList, null, 2))
          console.log(
            'warmup-access-list',
            'usingWarmup',
            `accessList ${warmupList.accessList?.length} codeHashes ${warmupList.codeHashes?.length}`
          )
        }
      }
    } else {
      //pointPermitWarmup === false
      if (verboseAALG) {
        console.log('warmup-access-list', txHash, ' POINTS do not permit spend')
      }
    }
  }

  let injectEndpoint = `inject`
  let injectPayload = tx
  if (usingWarmup) {
    injectEndpoint = `inject-with-warmup`
    injectPayload = { tx, warmupList }
  }

  if (verboseAALG) console.log('inject', injectEndpoint, 'warmup-access-list', usingWarmup)

  return new Promise((resolve, reject) => {
    const injectStartTime = Date.now()
    const aalgTime = injectStartTime - startTime
    console.log(`injecting tx to`, `${baseUrl}/${injectEndpoint}`, injectStartTime)
    axios
      .post(`${baseUrl}/${injectEndpoint}`, injectPayload)
      .then((response) => {
        const injectResult: InjectResponse = response.data
        if (injectResult && injectResult.success === false) {
          if (injectResult.reason.includes('Transaction nonce')) {
            nonceFailCount += 1
          }
          countInjectTxRejections(injectResult.reason)
        }
        let now = Date.now()
        const totalTime = now - startTime
        const injectTime = now - injectStartTime
        console.log(
          'inject tx result',
          txHash,
          injectResult,
          Date.now(),
          `totalTime: ${totalTime} injectTime: ${injectTime} aalgTime: ${aalgTime}`
        )
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
          countInjectTxRejections('No injection result')
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
      .catch((e: Error) => {
        if (config.verbose) console.log('injectAndRecordTx: Caught Exception: ' + e.message)
        countInjectTxRejections('Caught Exception: ' + trimInjectRejection(e.message))

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

export async function saveTxStatus(): Promise<void> {
  if (!config.recordTxStatus) return
  if (txStatuses.length === 0) return
  const txStatusesClone = [...txStatuses]
  txStatuses = []
  logEventEmitter.emit('tx_insert_db', txStatusesClone)
}

function countApiResponse(responseType: string, apiName: string, details: string, source?: string): void {
  let outputStr = `${apiName} ${details}`

  if (responseType === 'endpoint-success' && source) {
    outputStr += ` source:${source}`
  }

  nestedCountersInstance.countEvent(responseType, outputStr)
}

function countFailedResponse(apiName: string, details: string): void {
  countApiResponse('endpoint-response', apiName, details)
}

function countNonResponse(apiName: string, details: string): void {
  countApiResponse('endpoint-non-response', apiName, details)
}

function countSuccessResponse(apiName: string, details: string, source?: string): void {
  countApiResponse('endpoint-success', apiName, details, source)
}

function countInjectTxRejections(details: string): void {
  nestedCountersInstance.countEvent('injectTx-rejected', details)
}

function trimInjectRejection(message: string): string {
  if (message.includes('ECONNREFUSED')) {
    return 'ECONNREFUSED'
  } else return message
}
async function validateBlockNumberInput(blockNumberInput: string) {
  // If the block number is 'latest', return undefined, so that it will get latest balance
  if (blockNumberInput === 'latest') {
    return undefined
  }
  if (blockNumberInput === 'earliest') {
    return '0x0'
  }
  // If the block number is not a valid hex string, return undefined
  if (!isHex(blockNumberInput) || !parseInt(blockNumberInput, 16)) {
    return undefined
  }
  return blockNumberInput
}
export const methods = {
  web3_clientVersion: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'web3_clientVersion'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    /* prettier-ignore */ if (firstLineLogs) { console.log('Running web3_clientVersion', args) }
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running getCurrentBlockInfo', args) }
    const result = 'Mist/v0.9.3/darwin/go1.4.1'

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
    countSuccessResponse(api_name, 'success')
  },
  web3_sha3: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'web3_sha3'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    /* prettier-ignore */ if (firstLineLogs) { console.log('Running web3_sha3', args) }
    const result = '0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad'

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
    countSuccessResponse(api_name, 'success')
  },
  net_version: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'net_version'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    /* prettier-ignore */ if (firstLineLogs) { console.log('Running net_version', args) }
    const chainId = config.chainId.toString()

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, chainId)
    countSuccessResponse(api_name, 'success')
  },
  net_listening: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'net_listening'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running net_listening', args) }
    const result = true

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
    countSuccessResponse(api_name, 'success')
  },
  net_peerCount: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'net_peerCount'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running net_peerCount', args) }
    const result = '0x2'

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
    countSuccessResponse(api_name, 'success')
  },
  eth_protocolVersion: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_protocolVersion'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_protocolVersion', args) }
    const result = '54'

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
    countSuccessResponse(api_name, 'success')
  },
  eth_syncing: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_syncing'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_syncing', args) }
    // RPC talks only to active nodes, so result is always false.
    const result = false

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
    countSuccessResponse(api_name, 'success')
  },
  eth_coinbase: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_coinbase'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_coinbase', args) }
    const result = ''

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
    countSuccessResponse(api_name, 'success')
  },
  eth_mining: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_mining'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_mining', args) }
    const result = true

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
    countSuccessResponse(api_name, 'success')
  },
  eth_hashrate: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_hashrate'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_hashrate', args) }
    const result = '0x38a'

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
    countSuccessResponse(api_name, 'success')
  },
  eth_gasPrice: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_gasPrice'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_gasPrice', args) }

    const gasPrice = await serviceValidator.getGasPrice()
    if (gasPrice) {
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      callback(null, gasPrice)
      countSuccessResponse(api_name, 'success', 'serviceValidator')
      return
    }

    const fallbackGasPrice = '0x3f84fc7516' // 1 Gwei
    try {
      const { result } = await getGasPrice()
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      callback(null, result)
      countSuccessResponse(api_name, 'success', 'TBD')
      return
    } catch (e) {
      console.log('Unable to get gas price', e)
    }
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, fallbackGasPrice)
    countSuccessResponse(api_name, 'success fallback', 'TBD')
  },
  eth_accounts: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_accounts'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_accounts', args) }
    const result = ['0x407d73d8a49eeb85d32cf465507dd71d507100c1']

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
  },
  eth_blockNumber: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_blockNumber'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_blockNumber', args) }
    const result = await collectorAPI.getLatestBlockNumber()
    if (result) {
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      callback(null, '0x' + result.number.toString(16))
      countSuccessResponse(api_name, 'success', 'collector')
      return
    }
    const { blockNumber, nodeUrl } = await getCurrentBlockInfo()
    if (verbose) console.log('BLOCK NUMBER', blockNumber, parseInt(blockNumber, 16))
    if (blockNumber == null) {
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
      callback(null, '0x0')
      countFailedResponse(api_name, 'blockNumber is null')
    } else {
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
      callback(null, blockNumber)
      countSuccessResponse(api_name, 'success', 'validator')
    }
  },
  eth_getBalance: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_getBalance'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_getBalance', args) }

    let address
    let blockNumber
    try {
      address = args[0]
      blockNumber = args[1] || undefined
    } catch (e) {
      if (verbose) console.log('Unable to get address', e)
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      callback({ code: -32000, message: 'Unable to get address' }, null)
      countFailedResponse(api_name, 'Unable to get address')
      return
    }
    if (!isValidAddress(address)) {
      if (verbose) console.log('Invalid address', address)
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      callback({ code: -32000, message: 'Invalid address' }, null)
      countFailedResponse(api_name, 'Invalid address')
      return
    }
    // validate input blockNumber that support text such 'latest', 'earliest' ...
    blockNumber = await validateBlockNumberInput(blockNumber)
    let balance
    try {
      balance = await serviceValidator.getBalance(address, blockNumber)
      if (balance) {
        logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
        callback(null, intStringToHex(balance))
        countSuccessResponse(api_name, 'success', 'serviceValidator')
        return
      }
    } catch (e) {
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      callback({ code: 503, message: 'unable to get balanace' }, null)
      countFailedResponse(api_name, 'Unable to get balance')
      return
    }

    balance = '0x0'
    let nodeUrl
    try {
      if (verbose) console.log('address', address)
      if (verbose) console.log('ETH balance', typeof balance, balance)
      const res = await getAccountFromValidator(address)
      nodeUrl = res.nodeUrl
      if ('account' in res) {
        const account = res.account
        if (verbose) console.log('account', account)
        if (!account) {
          // This covers the case where this is an uninitialized EOA
          // and our validators return { account: null }
          // hence returning balance as 0x0
          logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
          callback(null, balance)
          countSuccessResponse(api_name, 'success', 'validator')
        } else {
          if (verbose) console.log('Shardeum balance', typeof account.balance, account.balance)
          const balance = intStringToHex(account.balance)
          if (verbose) console.log('SHD', typeof balance, balance)
          logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
          callback(null, balance)
          countSuccessResponse(api_name, 'success', 'validator')
        }
      } else {
        logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: false }, performance.now())
        callback({ code: 503, message: 'unable to get balanace' }, null)
        countFailedResponse(api_name, 'Unable to get account')
      }
    } catch (e) {
      // if (verbose) console.log('Unable to get account balance', e)
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: false }, performance.now())
      callback({ code: 503, message: 'unable to get balanace' }, null)
      countFailedResponse(api_name, 'Unable to get balance from validator')
    }
    if (verbose) console.log('Final balance', balance)
  },
  eth_getStorageAt: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_getStorageAt'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_getStorageAt', args) }
    try {
      const contractAddress = args[0]
      let position = args[1]
      const block = args[2] || 'latest' // block number/ block hash/ latest
      if (!contractAddress || contractAddress.length !== 42) {
        logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
        callback({ code: -32000, message: 'Invalid address' }, null)
        countFailedResponse(api_name, 'Invalid address')
        return
      }
      if (!position || isHex(position) === false) {
        logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
        callback({ code: -32000, message: 'Invalid position' }, null)
        countFailedResponse(api_name, 'Invalid position')
        return
      }
      if (block !== 'latest') {
        logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
        callback({ code: -32000, message: 'Only support for latest block' }, null)
        countFailedResponse(api_name, 'Only support for latest block')
        return
      }
      if (position.length !== 66) {
        // Convert to 32 bytes hex string
        position = '0x' + '0'.repeat(66 - position.length) + position.slice(2)
      }
      const storageAccountId = calculateContractStorageAccountId(
        contractAddress.toLowerCase(),
        position.toLowerCase()
      )
      if (CONFIG.collectorSourcing.enabled) {
        const res = await collectorAPI.fetchAccount(storageAccountId)
        if (res?.data?.accounts[0]?.account?.value) {
          const value = Uint8Array.from(Object.values(res?.data?.accounts[0]?.account?.value))
          const hexValue = bytesToHex(value)
          logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
          callback(null, hexValue)
          countSuccessResponse(api_name, 'success', 'collector')
          return
        }
      }

      if (CONFIG.serviceValidatorSourcing.enabled) {
        const res = await serviceValidator.getAccount(storageAccountId)
        if (res?.value) {
          const value = Uint8Array.from(Object.values(res?.value))
          const hexValue = bytesToHex(value)
          logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
          callback(null, hexValue)
          countSuccessResponse(api_name, 'success', 'serviceValidator')
          return
        }
      }
      if (config.queryFromValidator) {
        const res: any = await getAccountFromValidator(storageAccountId)
        if (res && res.account && res.account['value']) {
          const value = Uint8Array.from(Object.values(res?.account['value']))
          const hexValue = bytesToHex(value)
          logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
          callback(null, hexValue)
          countSuccessResponse(api_name, 'success', 'validator')
          return
        }
      }
      const result = '0x'
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      callback(null, result)
      countSuccessResponse(api_name, 'success', 'fallback')
    } catch (e) {
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      callback({ code: -32000, message: 'Unable to get storage' }, null)
      countFailedResponse(api_name, 'Unable to get storage')
    }
  },
  eth_getTransactionCount: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_getTransactionCount'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running getTransactionCount', args) }

    let address
    let blockNumber
    try {
      address = args[0]
      blockNumber = args[1] || undefined
    } catch (e) {
      if (verbose) console.log('Unable to get address', e)
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      callback({ code: -32000, message: 'Unable to get address' }, null)
      countFailedResponse(api_name, 'Unable to get address')
      return
    }
    if (!isValidAddress(address)) {
      if (verbose) console.log('Invalid address', address)
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      callback({ code: -32000, message: 'Invalid address' }, null)
      countFailedResponse(api_name, 'Invalid address')
      return
    }

    if (CONFIG.serviceValidatorSourcing.enabled) {
      try {
        const nonce = await serviceValidator.getTransactionCount(address, blockNumber)
        if (nonce) {
          logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
          callback(null, intStringToHex(nonce))
          countSuccessResponse(api_name, 'success', 'serviceValidator')
          return
        }
      } catch (e) {
        logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
        callback({ code: 503, message: 'Unable to get transaction count' }, null)
        countFailedResponse(api_name, 'exception getting transaction count from serviceValidator')
        return
      }
    }

    let nodeUrl
    try {
      const address = args[0]
      const res = await getAccountFromValidator(address)
      nodeUrl = res.nodeUrl
      if ('account' in res) {
        const account = res.account
        if (!account) {
          // This covers the case where this is an uninitialized EOA
          // and our validators return { account: null }
          // hence returning nonce as 0x0
          logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
          callback(null, '0x0')
          countSuccessResponse(api_name, 'success', 'validator')
        } else {
          const nonce = parseInt(account.nonce)
          let result = '0x' + nonce.toString(16)
          if (result === '0x') result = '0x0'
          if (verbose) {
            console.log('account.nonce', account.nonce)
            console.log('Transaction count', result)
          }

          logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
          callback(null, result)
          countSuccessResponse(api_name, 'success', 'validator')
        }
      } else {
        logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
        callback({ code: -32001, message: 'Unable to get transaction count' }, null)
        countFailedResponse(api_name, 'Unable to get transaction count from validator')
      }
    } catch (e) {
      if (verbose) console.log('Unable to getTransactionCount', e)
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: false }, performance.now())
      callback({ code: -32001, message: 'Unable to get transaction count' }, null)
      countFailedResponse(api_name, 'exception getting transaction count from validator')
    }
  },
  eth_getBlockTransactionCountByHash: async function (
    args: RequestParamsLike,
    callback: JSONRPCCallbackTypePlain
  ) {
    const api_name = 'eth_getBlockTransactionCountByHash'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_getBlockTransactionCountByHash', args) }
    let blockHash = (args as string[])[0]
    if (!config.collectorSourcing.enabled && !config.queryFromExplorer)
      console.log('Both collectorSourcing and queryFromExplorer turned off. Could not process request')

    if ((config.collectorSourcing.enabled || config.queryFromExplorer) && blockHash === 'latest') {
      const res = await requestWithRetry(RequestMethod.Get, `/eth_getBlockByHash?blockHash=${blockHash}`)
      if (res.data.block) blockHash = res.data.block.hash
    }

    if (CONFIG.collectorSourcing.enabled) {
      const res = await collectorAPI.getTransactionByBlock({ blockHash, countOnly: true })
      if (res !== null) {
        const result = '0x' + (res as number).toString(16)
        if (verbose) console.log('BLOCK TRANSACTIONS COUNT DETAIL', result)
        callback(null, result)
        countSuccessResponse(api_name, 'success', 'collector')
        logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
        return
      }
    }
    if (config.queryFromExplorer) {
      const explorerUrl = config.explorerUrl
      try {
        const url = `${explorerUrl}/api/transaction?blockHash=${blockHash}&countOnly=true`
        const res = await axios.get(url)
        if (verbose) {
          console.log('url', url)
          console.log('res', JSON.stringify(res.data))
        }
        if (res.data.error) console.log('error', res.data.error)
        if (res.data.totalTransactions || res.data.totalTransactions === 0) {
          const result = '0x' + res.data.totalTransactions.toString(16)

          const nodeUrl = config.explorerUrl
          if (verbose) console.log('BLOCK TRANSACTIONS COUNT DETAIL', result)
          callback(null, result)
          countSuccessResponse(api_name, 'success', 'explorer')
          logEventEmitter.emit(
            'fn_end',
            ticket,
            { nodeUrl, success: res.data.totalTransactions ? true : false },
            performance.now()
          )
          return
        }
      } catch (e) {
        if (verbose) console.log((e as AxiosError).message)
      }
    }
    callback(null, null)
    countSuccessResponse(api_name, 'success no result', 'fallback')
    logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
  },
  eth_getBlockTransactionCountByNumber: async function (
    args: RequestParamsLike,
    callback: JSONRPCCallbackTypePlain
  ) {
    const api_name = 'eth_getBlockTransactionCountByNumber'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_getBlockTransactionCountByNumber', args) }

    let blockNumber = args[0]

    if (!config.collectorSourcing.enabled && !config.queryFromExplorer)
      console.log('Both collectorSourcing and queryFromExplorer turned off. Could not process request')

    if (config.collectorSourcing.enabled || config.queryFromExplorer) {
      if (blockNumber !== 'latest' && blockNumber !== 'earliest')
        blockNumber = parseInt(blockNumber, 16).toString()
      if (blockNumber === 'latest' || blockNumber === 'earliest') {
        const res = await requestWithRetry(
          RequestMethod.Get,
          `/eth_getBlockByNumber?blockNumber=${blockNumber}`
        )
        if (res.data.block) blockNumber = res.data.block.number
      }
    }

    if (CONFIG.collectorSourcing.enabled) {
      const res = await collectorAPI.getTransactionByBlock({ blockNumber, countOnly: true })
      if (res !== null) {
        const result = '0x' + (res as number).toString(16)
        if (verbose) console.log('BLOCK TRANSACTIONS COUNT DETAIL', result)
        callback(null, result)
        countSuccessResponse(api_name, 'success', 'collector')
        logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
        return
      }
    }
    if (config.queryFromExplorer) {
      const explorerUrl = config.explorerUrl
      try {
        const url = `${explorerUrl}/api/transaction?blockNumber=${blockNumber}&countOnly=true`
        const res = await axios.get(url)
        if (verbose) {
          console.log('url', url)
          console.log('res', JSON.stringify(res.data))
        }
        if (res.data.error) console.log('error', res.data.error)
        if (res.data.totalTransactions || res.data.totalTransactions === 0) {
          const result = '0x' + res.data.totalTransactions.toString(16)

          const nodeUrl = config.explorerUrl
          if (verbose) console.log('BLOCK TRANSACTIONS COUNT DETAIL', result)
          callback(null, result)
          countSuccessResponse(api_name, 'success', 'explorer')
          logEventEmitter.emit(
            'fn_end',
            ticket,
            { nodeUrl, success: res.data.totalTransactions ? true : false },
            performance.now()
          )
          return
        }
      } catch (e) {
        if (verbose) console.log((e as AxiosError).message)
      }
    }
    callback(null, null)
    logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
  },
  eth_getUncleCountByBlockHash: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_getUncleCountByBlockHash'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running getUncleCountByBlockHash', args) }
    const result = '0x0'

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
    countSuccessResponse(api_name, 'success')
  },
  eth_getUncleCountByBlockNumber: async function (
    args: RequestParamsLike,
    callback: JSONRPCCallbackTypePlain
  ) {
    const api_name = 'eth_getUncleCountByBlockNumber'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running getUnbleCountByBlockNumber', args) }
    const result = '0x0'

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
    countSuccessResponse(api_name, 'success')
  },
  eth_getCode: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_getCode'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running getCode', args) }

    let contractAddress
    let blockNumber
    try {
      contractAddress = args[0]
      blockNumber = args[1] || undefined
    } catch (e) {
      console.log('Unable to get contract address', e)
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      callback(null, '0x')
      countFailedResponse(api_name, 'Unable to get contract address')
      return
    }
    if (!isValidAddress(contractAddress)) {
      console.log('Invalid contract address', contractAddress)
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      callback(null, '0x')
      countFailedResponse(api_name, 'Invalid contract address')
      return
    }
    blockNumber = isHexString(blockNumber) ? blockNumber : null
    const code = await serviceValidator.getContractCode(contractAddress, blockNumber)
    if (code) {
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      callback(null, code)
      countSuccessResponse(api_name, 'success', 'serviceValidator')
      return
    }

    let nodeUrl
    try {
      const res = await getCode(contractAddress, blockNumber)
      const contractCode = res.contractCode
      nodeUrl = res.nodeUrl ? res.nodeUrl : undefined

      if (verbose) console.log('eth_getCode result', contractCode)
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
      callback(null, contractCode)
      countSuccessResponse(api_name, 'success', 'TBD')
      return
    } catch (e) {
      console.log('Unable to eth_getCode', e)
      countNonResponse(api_name, 'exepction getting code')
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: false }, performance.now())
    }
  },
  eth_signTransaction: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_signTransaction'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_signTransaction', args) }
    const result =
      '0xa3f20717a250c2b0b729b7e5becbff67fdaef7e0699da4de7ca5895b02a170a12d887fd3b17bfdce3481f10bea41f45ba9f709d39ce8325427b57afcfc994cee1b'
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
    countSuccessResponse(api_name, 'success')
  },
  eth_sendTransaction: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_sendTransaction'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    /* prettier-ignore */ if (firstLineLogs) { console.log('Running sendTransaction', args) }
    const result = '0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99d05921026d1527331'

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
    countSuccessResponse(api_name, 'success')
  },
  eth_sendRawTransaction: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_sendRawTransaction'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    const now = getSyncTime()
    if (firstLineLogs) {
      console.log('Sending raw tx to /inject endpoint', new Date(now), now)
      console.log('Running sendRawTransaction', args)
    }
    let nodeUrl: string | undefined | Promise<string>
    let txHash = ''
    let gasLimit = ''
    try {
      const { isInternalTx } = args[0]
      let tx: OriginalTxData

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
      }

      injectWithRetries(txHash, tx, args)
        .then((res) => {
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
            countSuccessResponse(api_name, 'success', 'TBD')
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
              {
                ...serializeError(
                  { status: res.status },
                  { fallbackError: { message: res.reason, code: 101 } }
                ),
                data: {},
              },
              null
            )
            countFailedResponse(api_name, 'non success response from injectAndRecordTx')
          }
          return res
        })
        .catch((e: any) => {
          console.log('inject raw ', e.message, e.stack)
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
          countFailedResponse(api_name, 'exception in injectAndRecordTx')
          return undefined
        })
        .then((res) => {
          // Gas cache verification starts here

          // Return if transaction was successful or if cache is disabled
          if (config.gasEstimateUseCache === false) {
            throw new Error('Verification not required: gas cache is disabled' + JSON.stringify(res))
          }

          // Return if transaction was not injected
          if (!res || res.success !== true) {
            throw new Error('Gas verification error: Unable to determine inject response ' + res?.reason)
          }

          const transaction = getTransactionObj(tx)
          if (!transaction.to) {
            throw new Error('Gas verification not required: Contract creation transaction')
          }

          return fetchTxReceiptFromArchiver(txHash)
        })
        .then((transaction: TransactionFromArchiver) => {
          if (!('readableReceipt' in transaction.data)) {
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
    } catch (e: unknown) {
      console.log(`Error while injecting tx to consensor`, e)
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred'
      logEventEmitter.emit(
        'fn_end',
        ticket,
        {
          nodeUrl,
          success: false,
          reason: errorMessage,
          hash: txHash,
        },
        performance.now()
      )
      //[] this is a generic code. Should no code be here or should we pick a more specific code?
      callback({ message: errorMessage } as JSONRPCError, null)
      countFailedResponse(api_name, 'exception while injecting tx to consensor')
    }
  },
  eth_sendInternalTransaction: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_sendInternalTransaction'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    const now = Date.now()
    if (firstLineLogs) {
      console.log('Sending internal tx to /inject endpoint', new Date(now), now)
      console.log('Running eth_sendInternalTransaction', args)
    }
    const txHash = ''
    try {
      const internalTx = args[0]

      if (config.generateTxTimestamp && internalTx.timestamp == null) internalTx.timestamp = now

      injectWithRetries(txHash, internalTx, args)
        .then((res) => {
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
            countSuccessResponse(api_name, 'success', 'TBD')
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
            callback({ message: 'Internal tx injection failure' } as JSONRPCError, null)
            countFailedResponse(api_name, 'non success response from injectAndRecordTx')
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
          countFailedResponse(api_name, 'exception in injectAndRecordTx')
        })
    } catch (e) {
      console.log(`Error while injecting tx to consensor`, e)
      logEventEmitter.emit('fn_end', ticket, { nodeUrl: undefined, success: false }, performance.now())
      callback({ message: e } as JSONRPCError, null)
      countFailedResponse(api_name, 'exception while injecting tx to consensor')
    }
  },
  eth_call: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_call'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_call', args) }
    const callObj = args[0]
    //callObj.gasPrice = new BN(0)
    if (!callObj.from || callObj.from === '0x0000000000000000000000000000000000000000') {
      callObj['from'] = '0x2041B9176A4839dAf7A4DcC6a97BA023953d9ad9'
    }
    if (verbose) console.log('callObj', callObj)

    if (!callObj.to || !callObj.data) {
      const error: JSONRPCError = {
        code: -32602, // JSON-RPC error code for invalid params
        message: "Invalid params: 'to' or 'data' not provided",
      }
      callback(error)
      countFailedResponse(api_name, 'Invalid params: "to" or "data" not provided')
      return
    }

    let blockNumber: string | undefined
    let blockTimestamp: string | undefined
    if (args[1]) {
      const block = await collectorAPI.getBlock(args[1], 'hex_num')
      if (block) {
        blockNumber = block.number
        blockTimestamp = block.timestamp
      }
    }

    let response = await serviceValidator.ethCall(callObj, blockNumber, blockTimestamp)
    if (response !== null && !isErr(response)) {
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      if (typeof response !== 'string' && response.error) {
        // evm execution error (revert)
        callback(response.error)
        return
      }
      callback(null, '0x' + response)
      countSuccessResponse(api_name, 'success', 'serviceValidator')
      return
    } else if (response === null) {
      console.log('eth_call error', response)
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      callback(errorBusy)
      countFailedResponse(api_name, 'serviceValidator returned null')
      return
    }

    try {
      const res = await requestWithRetry(RequestMethod.Post, `/contract/call`, callObj)
      const nodeUrl = res.data.nodeUrl
      if (verbose) console.log('contract call res.data.result', callObj, nodeUrl, res.data.result)
      if (res.data == null || res.data.result == null) {
        //callback(null, errorHexStatus)
        callback(errorBusy)
        countFailedResponse(api_name, 'contract/call returned null')

        // add this in to catch contract call failures
        // console.log(`
        // ############# contract/call returned null  ${nodeUrl}
        // `)

        logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: false }, performance.now())
        return
      }

      if (res.data.result.error) {
        // evm execution error (revert)
        callback(res.data.result.error)
        logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
        return
      }
      const result = '0x' + res.data.result
      if (verbose) console.log('eth_call result from', nodeUrl, result)
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
      callback(null, result)
      countSuccessResponse(api_name, 'success', 'TBD')
    } catch (e) {
      console.log(`Error while making an eth call`, e)
      //callback(null, errorHexStatus)
      logEventEmitter.emit('fn_end', ticket, { nodeUrl: undefined, success: false }, performance.now())
      callback(errorBusy)
      countFailedResponse(api_name, 'exception while making an eth call')
    }
  },
  eth_estimateGas: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_estimateGas'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    // Check input args not empty
    const callbackWithErrorMessage = function (errorMessage: string) {
      const error: JSONRPCError = {
        code: -32602, // JSON-RPC error code for invalid params
        message: errorMessage,
      }
      callback(error, null)
      countFailedResponse(api_name, errorMessage)
    }
    if (args.length == 0) {
      callbackWithErrorMessage('Invalid params: empty array args')
      return
    }

    // Check if input values are in hex format
    const arg = args[0]
    if (arg['from'] && !isValidAddress(arg['from'])) {
      callbackWithErrorMessage('Invalid params: from address is ill-formatted')
      return
    }

    if (arg['to'] && !isValidAddress(arg['to'])) {
      callbackWithErrorMessage('Invalid params: to address is ill-formatted')
      return
    }
    if (arg['data'] && !isHexOrEmptyHex(arg['data'])) {
      callbackWithErrorMessage('Invalid params: data must be hex format')
      return
    }

    if (arg['value'] && !isHexOrEmptyHex(arg['value'])) {
      callbackWithErrorMessage('Invalid params: value must be hex format')
      return
    }

    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running estimateGas', args) }
    // const result = '0x1C9C380' // 30 M gas
    if (config.staticGasEstimate) {
      callback(null, config.staticGasEstimate)
      countSuccessResponse(api_name, 'success using static gas estimate', 'static')
      return
    }

    let result = '0x2DC6C0' // 3 M gas
    try {
      if (!args[0]['to'] && !args[0]['data']) {
        callback(null, result)
        countSuccessResponse(api_name, 'success to and data args not set (default to 3M)', 'fallback')
        return
      }
      if (args[0]['to'] === '0x0000000000000000000000000000000000000001') {
        // TODO: Calculate according to formula
        callback(null, result)
        countSuccessResponse(api_name, 'success to set to 0x...0001 (default to 3M)', 'fallback')
        return
      }
      if (!args[0]['data']) {
        // Check if receiver is an EOA. If so, return 21000
        const res = await getCode(args[0]['to'])
        if (res.contractCode === '0x') {
          // return 21000
          callback(null, '0x5208')
          countSuccessResponse(api_name, 'success no data (default to 21000)', 'fallback')
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
        countSuccessResponse(api_name, 'success using cached gas estimate', 'cache')
        return
      }
      let originalEstimate = new BN(0)
      if (config.gasEstimateMethod === 'replayEngine') {
        const replayOutput = await replayGas(args[0])
        originalEstimate = hexToBN(replayOutput[0])
      } else if (config.gasEstimateMethod === 'validator') {
        const gasEstimateParam = args[0]
        const res = await requestWithRetry(RequestMethod.Post, `/contract/estimateGas`, gasEstimateParam)

        if (res.data?.estimateGas) {
          originalEstimate = hexToBN(res.data.estimateGas)
        } else if (typeof res.data === 'string' && isHexPrefixed(res.data) && res.data !== '0x') {
          originalEstimate = hexToBN(res.data)
        }
      } else if (config.gasEstimateMethod === 'serviceValidator') {
        const gasEstimate = await serviceValidator.estimateGas(args[0])
        if (gasEstimate) originalEstimate = hexToBN(gasEstimate)
      }

      if (!originalEstimate.isZero()) {
        originalEstimate.imuln(BUFFER)

        if (originalEstimate.gt(MAX_ESTIMATE_GAS)) {
          callback(null, '0x' + MAX_ESTIMATE_GAS.toString('hex'))
          countSuccessResponse(api_name, 'success using max gas estimate', 'TBD')
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
    countSuccessResponse(api_name, 'success', 'TBD')
  },
  eth_getBlockByHash: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_getBlockByHash'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running getBlockByHash', args) }
    let result: readableBlock | null = null
    //getCurrentBlock handles errors, no try catch needed
    result = await collectorAPI.getBlock(args[0], 'hash', args[1])
    if (!result) {
      // since there are no transactions included when we query from validator,
      // the transaction_detail_flag is not used
      const res = await requestWithRetry(RequestMethod.Get, `/eth_getBlockByHash?blockHash=${args[0]}`)
      result = res.data.block
    }

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
  },
  eth_getBlockByNumber: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_getBlockByNumber'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running getBlockByNumber', args) }
    let result: readableBlock | null = null
    let nodeUrl = null
    let blockNumber = args[0]
    if (args[0] !== 'latest' && args[0] !== 'earliest') {
      blockNumber = parseInt(blockNumber)
    }

    result = await collectorAPI.getBlock(args[0], 'hex_num', args[1])
    if (!result) {
      if (verbose) console.log('eth_getBlockByNumber !result', blockNumber, args[0])
      const responseCheck = (data: any): boolean => {
        return data.block !== undefined
      }
      const res = await requestWithRetry(
        RequestMethod.Get,
        `/eth_getBlockByNumber?blockNumber=${blockNumber}`,
        undefined,
        undefined,
        undefined,
        responseCheck
      )
      result = res.data.block
      nodeUrl = res.data.nodeUrl
      if (!result) {
        callback({ code: 214, message: 'failed to get block by number' })
        countFailedResponse(api_name, 'failed to get block by number')
        logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
        return
      }
    }
    if (verbose) console.log('BLOCK DETAIL', result)
    //pushed this functionality back to getblock()
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: result ? true : false }, performance.now())
  },
  eth_getBlockReceipts: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_getBlockReceipts'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running getBlockReceipts', args) }
    let blockNumber = args[0]
    if (!config.collectorSourcing.enabled && !config.queryFromExplorer)
      console.log('Both collectorSourcing and queryFromExplorer turned off. Could not process request')

    if (config.collectorSourcing.enabled || config.queryFromExplorer) {
      if (blockNumber !== 'latest' && blockNumber !== 'earliest') blockNumber = parseInt(blockNumber, 16)
      if (blockNumber === 'latest') {
        const res = await requestWithRetry(
          RequestMethod.Get,
          `/eth_getBlockByNumber?blockNumber=${blockNumber}`
        )
        if (res.data.block) blockNumber = res.data.block.number
      }
      if (blockNumber === 'earliest') blockNumber = 0
    }
    if (CONFIG.collectorSourcing.enabled) {
      const res = await collectorAPI.getTransactionByBlock({ blockNumber, countOnly: false })
      if (res !== null) {
        let index = 0
        const result = []
        for (const transaction of res) {
          result.push(extractTransactionReceiptObject(transaction, index))
          index++
        }
        if (verbose) console.log('BLOCK RECEIPTS DETAIL', result)
        callback(null, result)
        countSuccessResponse(api_name, 'success', 'collector')
        logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
        return
      }
    }
    if (config.queryFromExplorer) {
      const explorerUrl = config.explorerUrl
      const res = await axios.get(`${explorerUrl}/api/transaction?blockNumber=${blockNumber}`)
      if (verbose) {
        console.log('url', `${explorerUrl}/api/transaction?blockNumber=${blockNumber}`)
        console.log('res', JSON.stringify(res.data))
      }
      let index = 0
      const result = []
      for (const transaction of res.data.transactions) {
        result.push(extractTransactionReceiptObject(transaction, index))
        index++
      }
      const nodeUrl = config.explorerUrl
      if (verbose) console.log('BLOCK RECEIPTS DETAIL', result)
      callback(null, result)
      countSuccessResponse(api_name, 'success', 'explorer')
      logEventEmitter.emit(
        'fn_end',
        ticket,
        { nodeUrl, success: res.data.transactions ? true : false },
        performance.now()
      )
    }
    callback(null, null)
    countFailedResponse(api_name, 'neither collector or explorer are enabled')
    logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
  },
  eth_feeHistory: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_feeHistory'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_feeHistory', args) }
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
      countFailedResponse(api_name, 'invalid input')
    } else {
      if (blockCount > newestBlock) {
        blockCount = newestBlock
      }
      const result: {
        oldestBlock: string
        baseFeePerGas: number[]
        gasUsedRatio: number[]
        reward: undefined
      } = {
        oldestBlock: '',
        baseFeePerGas: [],
        gasUsedRatio: [],
        reward: undefined,
      }
      if (config.queryFromValidator && config.queryFromExplorer) {
        const explorerUrl = config.explorerUrl
        if (newestBlock === 'earliest') {
          blockCount = 1
        }
        if (newestBlock === 'latest' || newestBlock === 'earliest') {
          const res = await requestWithRetry(
            RequestMethod.Get,
            `/eth_getBlockByNumber?blockNumber=${newestBlock}`
          )
          if (res.data.block) newestBlock = res.data.block.number
        }
        for (let i = 0; i < blockCount; i++) {
          const blockNumber = newestBlock - i
          const res = await axios.get(`${explorerUrl}/api/transaction?blockNumber=${blockNumber}`)
          const gasPrices = []
          let gasUsed = 0
          let gasLimit = 0
          for (const transaction of res.data.transactions) {
            gasUsed += hexStrToInt(transaction.wrappedEVMAccount.readableReceipt.gasUsed)
            gasLimit += hexStrToInt(transaction.wrappedEVMAccount.readableReceipt.gasLimit)
            gasPrices.push(transaction.wrappedEVMAccount.readableReceipt.gasPrice)
          }
          result.gasUsedRatio.unshift(gasUsed === 0 && gasLimit === 0 ? 0 : gasUsed / gasLimit)
          result.baseFeePerGas.unshift(...gasPrices.map((price) => parseInt(price, 16)))

          if (blockNumber === newestBlock - blockCount + 1) {
            result.oldestBlock = '0x' + blockNumber.toString(16)
          }
        }
      } else {
        console.log('queryFromValidator and/or queryFromExplorer turned off. Could not process request')
      }
      callback(null, result)
      countSuccessResponse(api_name, 'success', 'TBD')
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    }
  },
  eth_getTransactionByHash: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_getTransactionByHash'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running getTransactionByHash', args) }
    const txHash = args[0]
    if (!isHexString(txHash)) {
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      callback({ message: 'Invalid transaction hex string' } as JSONRPCError, null)
      countFailedResponse(api_name, 'invalid transaction hex string')
      return
    }
    let retry = 0
    let success = false
    let result = null
    result = await collectorAPI.getTransactionByHash(txHash)
    if (!result) {
      // optimistically return null if the transaction is not found in the collector
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      callback(null, null)
      countFailedResponse(api_name, 'transaction not found in collector')
      return
    } else if (!isErr(result)) {
      // result found, skipping querying from archiver, validator and explorer.
      success = true
      retry = 100
      // start to query getBlock to get transactionIndex
      if (result) {
        try {
          // getBlock
          const txBlockNumber = result.blockNumber
          const blockResp = await collectorAPI.getBlock(txBlockNumber, 'hex_num', true)
          if (blockResp) {
            const transactions = blockResp.transactions
            const txIndex = transactions.findIndex((tx) => {
              if (typeof tx === 'string') {
                return false
              }
              return tx.hash.toString() === txHash
            })
            // console.log("txIndex", txIndex)
            if (txIndex !== -1) {
              result.transactionIndex = '0x' + txIndex.toString(16)
            }
          }
        } catch (e) {
          if (verbose)
            console.log(
              'try to get transactionIndex using collector but fail. Return default transactionIndex'
            )
          logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
          callback(null, result)
          countSuccessResponse(api_name, 'success', 'collector')
          return
        }
      }
      console.log('result', result)
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      callback(null, result)
      countSuccessResponse(api_name, 'success', 'collector')
      return
    } else {
      result = null
    }
    let nodeUrl
    while (retry < 5 && !success) {
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
      countFailedResponse(api_name, 'transaction not found in validator, archiver and explorer')
      return
    }
    result = extractTransactionObject(result)
    if (verbose) console.log('Final Tx:', txHash, result)
    logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
  },
  eth_getTransactionByBlockHashAndIndex: async function (
    args: RequestParamsLike,
    callback: JSONRPCCallbackTypePlain
  ) {
    const api_name = 'eth_getTransactionByBlockHashAndIndex'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_getTransactionByBlockHashAndIndex', args) }

    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    let result: string | completeReadableReceipt | null | undefined = null

    try {
      const blockResp = await collectorAPI.getBlock(args[0], 'hash', true)
      result = blockResp?.transactions[Number(args[1])]
      if (result) {
        callback(null, result)
        countSuccessResponse(api_name, 'success', 'collector')
        logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
        return
      }
    } catch (e) {
      callback(errorBusy)
      countFailedResponse(api_name, 'exception in collectorAPI.getBlock')
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
    }
    const blockHash = args[0]
    const index = parseInt(args[1], 16)
    //if (blockHash !== 'latest') blockHash = parseInt(blockHash, 16)
    if (config.queryFromValidator && config.queryFromExplorer) {
      const explorerUrl = config.explorerUrl
      try {
        const res = await axios.get(`${explorerUrl}/api/transaction?blockHash=${blockHash}`)
        if (verbose) {
          console.log('url', `${explorerUrl}/api/transaction?blockHash=${blockHash}`)
          console.log('res', JSON.stringify(res.data))
        }

        let result
        if (res.data.success) {
          if (typeof index === 'number' && index >= 0 && index < res.data.transactions.length) {
            // eslint-disable-next-line security/detect-object-injection
            result = extractTransactionObject(res.data.transactions[index], index)
          }
        } else result = null

        const nodeUrl = config.explorerUrl
        if (verbose) console.log('TRANSACTION DETAIL', result)
        callback(null, result)
        countSuccessResponse(api_name, 'success', 'explorer')
        logEventEmitter.emit(
          'fn_end',
          ticket,
          { nodeUrl, success: res.data.transactions.length ? true : false },
          performance.now()
        )
      } catch (error) {
        /* prettier-ignore */ if (verbose) console.log('Error: eth_getTransactionByBlockHashAndIndex', (error as AxiosError).message)
        callback(null, null)
        countFailedResponse(api_name, 'exception in axios.get')
        logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      }
    } else {
      console.log('queryFromValidator and/or queryFromExplorer turned off. Could not process request')
      callback(null, null)
      countFailedResponse(api_name, 'queryFromValidator and/or queryFromExplorer turned off')
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    }
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'fallback')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_getTransactionByBlockNumberAndIndex: async function (
    args: RequestParamsLike,
    callback: JSONRPCCallbackTypePlain
  ) {
    const api_name = 'eth_getTransactionByBlockNumberAndIndex'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    let result: string | completeReadableReceipt | null | undefined = null
    try {
      const blockResp = await collectorAPI.getBlock(args[0], 'hex_num', true)
      result = blockResp?.transactions[Number(args[1])]
      if (result) {
        callback(null, result)
        countSuccessResponse(api_name, 'success', 'collector')
        logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
        return
      }
    } catch (e) {
      callback(errorBusy)
      countFailedResponse(api_name, 'exception in collectorAPI.getBlock')
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
    }
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_getTransactionByBlockNumberAndIndex', args) }
    let blockNumber = args[0]
    const index = parseInt(args[1], 16)
    if (blockNumber !== 'latest' && blockNumber !== 'earliest') blockNumber = parseInt(blockNumber, 16)
    if (blockNumber === 'earliest') blockNumber = 0
    if (config.queryFromExplorer) {
      const explorerUrl = config.explorerUrl
      try {
        const res = await axios.get(`${explorerUrl}/api/transaction?blockNumber=${blockNumber}`)
        if (verbose) {
          console.log('url', `${explorerUrl}/api/transaction?blockNumber=${blockNumber}`)
          console.log('res', JSON.stringify(res.data))
        }

        let result
        if (res.data.success) {
          if (typeof index === 'number' && index >= 0 && index < res.data.transactions.length) {
            // eslint-disable-next-line security/detect-object-injection
            result = extractTransactionObject(res.data.transactions[index], index)
          }
        } else result = null

        const nodeUrl = config.explorerUrl
        if (verbose) console.log('TRANSACTION DETAIL', result)
        callback(null, result)
        countSuccessResponse(api_name, 'success', 'explorer')
        logEventEmitter.emit(
          'fn_end',
          ticket,
          { nodeUrl, success: res.data.transactions.length ? true : false },
          performance.now()
        )
      } catch (error) {
        /* prettier-ignore */ if (verbose) console.log('Error: eth_getTransactionByBlockNumberAndIndex', (error as AxiosError).message)
        callback(null, null)
        countFailedResponse(api_name, 'exception in axios.get')
        logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      }
    } else {
      console.log('queryFromExplorer turned off. Could not process request')
      callback(null, null)
      countFailedResponse(api_name, 'queryFromExplorer turned off')
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    }
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'fallback')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_getTransactionReceipt: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_getTransactionReceipt'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    const now = Date.now()
    /* prettier-ignore */ if (firstLineLogs) { console.log('Getting tx receipt', new Date(now), now, 'args', args) }
    let nodeUrl
    try {
      let res
      let result
      const txHash = args[0]
      result = await collectorAPI.getTransactionReceipt(txHash)
      if (!result) {
        // optimistically return null if the receipt is not found in the collector
        logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
        callback(null, null)
        countFailedResponse(api_name, 'transaction receipt not found in collector')
        return
      } else if (!isErr(result)) {
        // result found, skipping querying from archiver, validator and explorer.
        result = extractTransactionReceiptObject(result)
        // start to query getBlock to get transactionIndex
        if (result) {
          try {
            // getBlock
            const txBlockNumber = result.blockNumber
            const blockResp = await collectorAPI.getBlock(txBlockNumber, 'hex_num', true)
            if (blockResp) {
              const transactions = blockResp.transactions
              const txIndex = transactions.findIndex((tx) => {
                if (typeof tx === 'string') {
                  return false
                }
                return tx.hash.toString() === txHash
              })
              // console.log("txIndex", txIndex)
              if (txIndex !== -1) {
                result.transactionIndex = '0x' + txIndex.toString(16)
              }
            }
          } catch (e) {
            if (verbose)
              console.log(
                'try to get transactionIndex using collector but fail. Return default transactionIndex'
              )
            logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
            callback(null, result)
            countSuccessResponse(api_name, 'success', 'collector')
            return
          }
        }
        logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
        callback(null, result)
        countSuccessResponse(api_name, 'success', 'collector')
        return
      } else {
        result = null
      }

      if (config.queryFromValidator && !result) {
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
        if (verbose) {
          console.log('querying eth_getTransactionReceipt from explorer', txHash)
        }
        const explorerUrl = config.explorerUrl
        res = await axios.get(`${explorerUrl}/api/transaction?txHash=${txHash}`)
        /* prettier-ignore */ if (verbose) console.log('url', `${explorerUrl}/api/transaction?txHash=${txHash}`, 'res', JSON.stringify(res.data))

        result = res.data.transactions ? res.data.transactions[0] : null
      }
      if (result) {
        result = extractTransactionReceiptObject(result)
        if (verbose) console.log(`getTransactionReceipt result for ${txHash}`, result)
      }
      callback(null, result)
      countSuccessResponse(api_name, 'success', 'TBD')
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
    } catch (e) {
      console.log('Unable to eth_getTransactionReceipt', e)
      //callback(null, errorHexStatus)
      callback(errorBusy)
      countFailedResponse(api_name, 'exception in axios.get')
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    }
  },
  eth_getUncleByBlockHashAndIndex: async function (
    args: RequestParamsLike,
    callback: JSONRPCCallbackTypePlain
  ) {
    const api_name = 'eth_getUncleByBlockHashAndIndex'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running getUncleByBlockHashAndIndex', args) }
    const result = null
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_getUncleByBlockNumberAndIndex: async function (
    args: RequestParamsLike,
    callback: JSONRPCCallbackTypePlain
  ) {
    const api_name = 'eth_getUncleByBlockNumberAndIndex'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running getUncleByBlockNumberAndIndex', args) }
    const result = null
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_getCompilers: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_getCompilers'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running getCompilers', args) }
    const result = ['solidity', 'lll', 'serpent']
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_compileSolidity: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_compileSolidity'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running compileSolidity', args) }
    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_compileLLL: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_compileLLL'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_compileSerpent: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_compileSerpent'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_newBlockFilter: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_newBlockFilter'
    nestedCountersInstance.countEvent('endpoint', api_name)
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
    const unsubscribe = (): void => void 0
    const internalFilter: Types.InternalFilter = {
      updates: [],
      filter: filterObj,
      unsubscribe,
      type: Types.FilterTypes.block,
    }
    filtersMap.set(filterId.toString(), internalFilter)

    callback(null, filterId)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_newPendingTransactionFilter: async function (
    args: RequestParamsLike,
    callback: JSONRPCCallbackTypePlain
  ) {
    const api_name = 'eth_newPendingTransactionFilter'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running newPendingTransactionFilter', args) }

    const currentBlock = await getCurrentBlock()
    const filterId = getFilterId()
    const filterObj: Types.PendingTransactionFilter = {
      id: filterId,
      lastQueriedTimestamp: Date.now(),
      lastQueriedBlock: parseInt(currentBlock.number.toString()),
      createdBlock: parseInt(currentBlock.number.toString()),
    }
    const unsubscribe = (): void => void 0
    const internalFilter: Types.InternalFilter = {
      updates: [],
      filter: filterObj,
      unsubscribe,
      type: Types.FilterTypes.pendingTransaction,
    }
    filtersMap.set(filterId.toString(), internalFilter)

    callback(null, filterId)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_uninstallFilter: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_uninstallFilter'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const filterId = args[0]
    const internalFilter = filtersMap.get(filterId)
    if (internalFilter == null) {
      callback(null, false)
      countFailedResponse(api_name, 'filter not found')
      return
    }

    internalFilter.unsubscribe()
    filtersMap.delete(filterId)

    callback(null, true)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_newFilter: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_newFilter'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    const inputFilter = args[0]
    if (inputFilter == null) {
      callback(null, null)
      countFailedResponse(api_name, 'filter not found')
      return
    }
    const { address, topics } = parseFilterDetails(inputFilter || {})
    // Add validate address
    if (address && address.length !== 42) {
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      callback({ code: -32000, message: 'Invalid address' }, null)
      countFailedResponse(api_name, 'Invalid address')
      return
    }
    // Add validate topics
    if (!checkValidHexTopics(topics)) {
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      callback({ code: -32000, message: 'Invalid topics' }, null)
      countFailedResponse(api_name, 'Invalid topics')
      return
    }
    // Add validate fromBlock and toBlock
    const fromBlock = await getFromBlockInput(inputFilter.fromBlock)
    const toBlock = await getToBlockInput(inputFilter.toBlock)
    if (fromBlock == null || toBlock == null) {
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      callback({ code: -32000, message: 'Invalid block number' }, null)
      countFailedResponse(api_name, 'Invalid block number')
      return
    }
    if (parseInt(fromBlock, 16) > parseInt(toBlock, 16)) {
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      callback({ code: -32000, message: 'Invalid block' }, null)
      countFailedResponse(api_name, 'Invalid block')
      return
    }
    const currentBlock = await getCurrentBlock()
    const filterId = getFilterId()
    const filterObj: Types.LogFilter = {
      id: filterId,
      address: address,
      topics,
      fromBlock,
      toBlock,
      lastQueriedTimestamp: Date.now(),
      lastQueriedBlock: parseInt(currentBlock.number.toString()),
      createdBlock: parseInt(currentBlock.number.toString()),
    }
    const unsubscribe = (): void => void 0
    const internalFilter: Types.InternalFilter = {
      updates: [],
      filter: filterObj,
      unsubscribe,
      type: Types.FilterTypes.log,
    }
    filtersMap.set(filterId.toString(), internalFilter)

    callback(null, filterId)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_getFilterChanges: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_getFilterChanges'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const filterId = args[0]

    const internalFilter: Types.InternalFilter | undefined = filtersMap.get(filterId.toString())
    let updates: string[] = []
    if (internalFilter && internalFilter.type === Types.FilterTypes.log) {
      const logFilter = internalFilter.filter as Types.LogFilter
      const request: Types.LogQueryRequest = {
        address: logFilter.address,
        topics: logFilter.topics,
        fromBlock: String(logFilter.lastQueriedBlock + 1),
      }
      /* prettier-ignore */ if (verbose) { console.log('filter changes request', request) }
      // try sourcing from collector api server
      const updatesFromCollector = await collectorAPI.getLogsByFilter(request)
      if (!updatesFromCollector) {
        // fallback to explorer
        updates = await getLogsFromExplorer(request)
      } else {
        updates = updatesFromCollector
      }
      internalFilter.updates = []
      const currentBlock = await getCurrentBlock()
      // this could potentially have issue because explorer server is a bit behind validator in terms of tx receipt or block number
      logFilter.lastQueriedBlock = parseInt(currentBlock.number.toString())
      logFilter.lastQueriedTimestamp = Date.now()
    } else if (internalFilter && internalFilter.type === Types.FilterTypes.block) {
      const blockFilter = internalFilter.filter as Types.BlockFilter
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
        const pendingTransactionHashes = await getExplorerPendingTransactions()

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
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_getFilterLogs: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_getFilterLogs'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const filterId = args[0]
    let logs: string[] = []

    const internalFilter: Types.InternalFilter | undefined = filtersMap.get(filterId.toString())
    if (internalFilter && internalFilter.type === Types.FilterTypes.log) {
      const logFilter = internalFilter.filter as Types.LogFilter
      const request: Types.LogQueryRequest = {
        address: logFilter.address,
        topics: logFilter.topics,
        fromBlock: String(logFilter.createdBlock),
      }
      if (logFilter.fromBlock) {
        request.fromBlock = String(logFilter.fromBlock)
      }
      if (CONFIG.collectorSourcing.enabled) {
        const logsFromCollector = await collectorAPI.getLogsByFilter(request)
        if (logsFromCollector) {
          callback(null, logsFromCollector)
          countSuccessResponse(api_name, 'success', 'collector')
          logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
          return
        }
      }
      logs = await getLogsFromExplorer(request)
    } else {
      console.error(`eth_getFilterChanges: filter not found: ${filterId}`)
    }

    if (config.verbose) console.log(`eth_getFilterLogs: filterId: ${filterId}`, logs)

    callback(null, logs)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_getLogs: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_getLogs'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running getLogs', args) }

    let { fromBlock, toBlock, blockHash, address, topics } = args[0]

    if (!logParamsAreValid(fromBlock, toBlock, blockHash)) {
      callback(null, new Error('eth_getLogs: Invalid parameters'))
      countFailedResponse(api_name, 'invalid parameters')
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      return
    }

    if (fromBlock === 'earliest') {
      fromBlock = '0x0'
    }
    if (fromBlock === 'latest') {
      fromBlock = await getBlockNumberForLatest(lastBlockInfo)
      if (!fromBlock || !isHex(fromBlock)) {
        callback(null, new Error(`eth_getLogs: failed to get current block`))
        countFailedResponse(api_name, 'failed to get current block 1')
        logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
        return
      }
    }

    if (toBlock === 'latest') {
      toBlock = await getBlockNumberForLatest(lastBlockInfo)
      if (!toBlock || !isHex(toBlock)) {
        callback(null, new Error(`eth_getLogs: failed to get current block`))
        countFailedResponse(api_name, 'failed to get current block 2')
        logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
        return
      }
    }
    if (blockHash) {
      const res = await requestWithRetry(RequestMethod.Get, `/eth_getBlockByHash?blockHash=${blockHash}`)
      if (res.data && res.data.block) {
        fromBlock = res.data.block.number
        toBlock = res.data.block.number
        if (!fromBlock || !toBlock || !isHex(fromBlock) || !isHex(toBlock)) {
          callback(null, new Error(`eth_getLogs: failed to get valid block by hash`))
          countFailedResponse(api_name, 'failed to get valid block by hash')
          logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
          return
        }
      } else {
        console.error(`eth_getLogs: failed to get block by hash`)
        callback(null, new Error(`eth_getLogs: failed to get block by hash`))
        countFailedResponse(api_name, 'failed to get block by hash')
        logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
        return
      }
    }
    if (CONFIG.collectorSourcing.enabled) {
      const logsFromCollector = await collectorAPI.getLogsByFilter({ fromBlock, toBlock, address, topics })

      if (logsFromCollector) {
        callback(null, logsFromCollector)
        countSuccessResponse(api_name, 'success', 'collector')
        logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
        return
      } else {
        callback(null, [])
        countFailedResponse(api_name, 'failed to get logs from collector')
        logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
        return
      }
    }

    async function getBlockNumberForLatest(lastBlockInfo: { blockNumber: string; timestamp: string }) {
      if (lastBlockInfo && lastBlockInfo.blockNumber && lastBlockInfo.blockNumber !== '0x0') {
        return lastBlockInfo.blockNumber
      } else {
        try {
          const { blockNumber } = await getCurrentBlockInfo()
          return blockNumber
        } catch (e) {
          console.error(`eth_getLogs: failed to get current block`, e)
          callback(null, new Error(`eth_getLogs: failed to get current block`))
          logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
          return null
        }
      }
    }

    function isValidToBlock(block: string) {
      return block === 'latest' || isHex(block)
    }

    function isValidFromBlock(block: string) {
      return isValidToBlock(block) || block === 'earliest'
    }

    function logParamsAreValid(fromBlock: string, toBlock: string, blockHash: string) {
      if (fromBlock && !isValidFromBlock(fromBlock)) {
        console.error(`Invalid 'fromBlock' parameter: ${fromBlock}`)
        return false
      }

      if (toBlock && !isValidToBlock(toBlock)) {
        console.error(`Invalid 'toBlock' parameter: ${toBlock}`)
        return false
      }

      if (blockHash && (!isHex(blockHash) || blockHash.length !== 66)) {
        console.error(`Invalid 'blockHash' parameter: ${blockHash}`)
        return false
      }
      return true
    }

    try {
      const logs = await getLogsFromExplorer({
        fromBlock,
        toBlock,
        topics,
        address,
      })
      callback(null, logs)
      countSuccessResponse(api_name, 'success', 'explorer')
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    } catch (error: any) {
      console.error(`eth_getLogs: ${error.message}`)
      callback(null, new Error(`eth_getLogs: ${error.message}`))
      countFailedResponse(api_name, 'exception in getLogsFromExplorer')
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
    }
  },
  eth_getWork: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_getWork'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_submitWork: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_submitWork'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_submitHashrate: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_submitHashrate'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  debug_traceTransaction: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'debug_traceTransaction'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now(), args[0], args[1])
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running debug_traceTransaction', args) }

    // Check if tracer is defined
    if (args[1] && args[1].tracer) {
      callback({ code: errorCode, message: 'Only the default opcode tracer is supported' })
      countFailedResponse(api_name, 'only the default opcode tracer is supported')
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      return
    }

    try {
      const result = await replayTransaction(args[0], '-s')
      callback(null, { structLogs: result })
      countSuccessResponse(api_name, 'success', 'replayer')
    } catch (e) {
      console.log(`Error while making an eth call`, e)
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      callback(errorBusy)
      countFailedResponse(api_name, 'exception in replayTransaction')
    }
  },
  debug_traceBlockByHash: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'debug_traceBlockByHash'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now(), args[0], args[1])
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running debug_traceBlockByHash', args) }

    // Check if tracer is defined
    if (args[1] && args[1].tracer) {
      callback({ code: errorCode, message: 'Only the default opcode tracer is supported' })
      countFailedResponse(api_name, 'only the default opcode tracer is supported')
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      return
    }

    const blockHash = args[0]

    try {
      //fetch block info
      let blockResult = await collectorAPI.getBlock(blockHash, 'hash', args[1])
      if (!blockResult) {
        const res = await requestWithRetry(RequestMethod.Get, `/eth_getBlockByHash?blockHash=${args[0]}`)
        blockResult = res.data.block
      }
      if (verbose) console.log('BLOCK DETAIL', blockResult)
      if (!blockResult) {
        // block not found
        if (verbose) {
          console.log('Block not found running debug_traceBlockByHash', args)
        }
        logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
        callback(null, null)
        countFailedResponse(api_name, 'block not found')
        return
      }

      //fetch transactions
      const result = []
      for (const tx of blockResult.transactions) {
        let txHash
        if (typeof tx === 'string') {
          txHash = tx
        } else {
          txHash = tx.transactionHash
        }
        if (!txHash) {
          continue
        }

        const txResult = await replayTransaction(txHash, '-s')
        result.push({ structLogs: txResult })
      }

      callback(null, result)
      countSuccessResponse(api_name, 'success', 'replayer')
    } catch (e) {
      console.log(`Error while making an eth call`, e)
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      callback(errorBusy)
      countFailedResponse(api_name, 'exception in replayTransaction')
    }
  },
  debug_traceBlockByNumber: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'debug_traceBlockByNumber'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now(), args[0], args[1])
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running debug_traceBlockByNumber', args) }

    // Check if tracer is defined
    if (args[1] && args[1].tracer) {
      callback({ code: errorCode, message: 'Only the default opcode tracer is supported' })
      countFailedResponse(api_name, 'only the default opcode tracer is supported')
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      return
    }

    let blockNumber = args[0]
    if (args[0] != 'latest' && args[0] != 'earliest') {
      blockNumber = parseInt(blockNumber)
    }

    try {
      //fetch block info
      let blockResult = await collectorAPI.getBlock(args[0], 'hex_num', args[1])
      if (!blockResult) {
        const res = await requestWithRetry(
          RequestMethod.Get,
          `/eth_getBlockByNumber?blockNumber=${blockNumber}`
        )
        blockResult = res.data.block
      }
      if (verbose) console.log('BLOCK DETAIL', blockResult)
      if (!blockResult) {
        // block not found
        if (verbose) {
          console.log('Block not found running debug_traceBlockByNumber', args)
        }
        logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
        callback(null, null)
        countFailedResponse(api_name, 'block not found')
        return
      }

      //fetch transactions
      const result = []
      for (const tx of blockResult.transactions) {
        let txHash
        if (typeof tx === 'string') {
          txHash = tx
        } else {
          txHash = tx.transactionHash
        }
        if (!txHash) {
          continue
        }

        const txResult = await replayTransaction(txHash, '-s')
        result.push({ structLogs: txResult })
      }

      callback(null, result)
      countSuccessResponse(api_name, 'success', 'replayer')
    } catch (e) {
      console.log(`Error while making an eth call`, e)
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      callback(errorBusy)
      countFailedResponse(api_name, 'exception in replayTransaction')
    }
  },
  debug_storageRangeAt: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'debug_storageRangeAt'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
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
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running debug_storageRangeAt', args) }

    // Fetch blockNumber by using eth_getBlockByHash
    const res = await requestWithRetry(RequestMethod.Get, `/eth_getBlockByHash?blockHash=${args[0]}`)
    const blockNumber = res.data.block.number

    const request: Types.LogQueryRequest = {
      address: args[2],
      fromBlock: blockNumber,
    }
    const logs = await getLogsFromExplorer(request)
    if (verbose) {
      console.log('THE LOGS ARE', logs)
    }
    callback(null, { storage: {} })
    countSuccessResponse(api_name, 'success', 'explorer')
  },
  debug_storageRangeAt2: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'debug_storageRangeAt2'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now(), args[0], args[1], args[2], args[3])
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running debug_storageRangeAt2', args) }

    try {
      const txHash = args[0]
      let states = await collectorAPI.getStorage(txHash)
      if (!states) {
        states = await fetchStorage(txHash)
      }
      const storageObject: {
        [key: string]: {
          key: string
          value: string
        }
      } = {}
      states.forEach((state) => {
        const keyBuf = parseAndValidateStringInput(state.key)
        const keyHash = keccak256(Buffer.from(keyBuf.buffer, keyBuf.byteOffset, keyBuf.length))
        storageObject[bufferToHex(keyHash)] = state
      })
      callback(null, { storage: storageObject })
      countSuccessResponse(api_name, 'success', 'collector')
    } catch (e) {
      console.log(`Error while making an eth call`, e)
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      callback(errorBusy)
      countFailedResponse(api_name, 'exception in fetchStorage')
    }
  },
  db_putString: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'db_putString'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  db_getString: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'db_getString'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  db_putHex: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'db_putHex'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  db_getHex: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'db_getHex'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_version: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'shh_version'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_post: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'shh_post'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_newIdentity: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'shh_newIdentity'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_hasIdentity: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'shh_hasIdentity'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_newGroup: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'shh_newGroup'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_addToGroup: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'shh_addToGroup'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_newFilter: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'shh_newFilter'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_uninstallFilter: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'shh_uninstallFilter'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_getFilterChanges: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'shh_getFilterChanges'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  shh_getMessages: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'shh_getMessages'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    const result = 'test'
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_chainId: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_chainId'
    nestedCountersInstance.countEvent('endpoint', api_name)
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')

    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_chainId', args) }
    const chainId = `${config.chainId}`
    const hexValue = '0x' + parseInt(chainId, 10).toString(16)
    callback(null, hexValue)
    countSuccessResponse(api_name, 'success', 'TBD')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  },
  eth_getAccessList: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_getAccessList'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_getAccessList', args) }

    const callObj = args[0]
    if (!callObj.hasOwnProperty('from')) {
      callback({ code: -32000, message: 'Missing `from` parameter' }, null)
      countFailedResponse(api_name, 'Invalid address')
      return
    }

    if (!isValidAddress(callObj.from)) {
      if (verbose) console.log('Invalid params: `from` is not valid address', callObj.from)
      callback({ code: -32000, message: 'Invalid params: `from` is not valid address' }, null)
      countFailedResponse(api_name, 'Invalid params: `from` is not valid address')
      return
    }

    const accessList = await serviceValidator.getAccessList(callObj)
    if (accessList) {
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
      callback(null, accessList)
      countSuccessResponse(api_name, 'success', 'servicevalidator')
      return
    }

    let nodeUrl
    try {
      const res = await requestWithRetry(RequestMethod.Post, `/contract/accesslist`, callObj)
      nodeUrl = res.data.nodeUrl
      if (verbose) console.log('contract eth_getAccessList res.data', callObj, res.data.nodeUrl, res.data)
      if (res.data == null || res.data.accessList == null) {
        logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
        callback(errorBusy)
        countFailedResponse(api_name, 'no accessList')
        return
      }
      if (verbose)
        console.log('predicted accessList from', res.data.nodeUrl, JSON.stringify(res.data.accessList))
      logEventEmitter.emit('fn_end', ticket, { nodeUrl, success: true }, performance.now())
      callback(null, res.data.accessList)
      countSuccessResponse(api_name, 'success', 'TBD')
    } catch (e) {
      console.log(`Error while making an eth call`, e)
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      callback(errorBusy)
      countFailedResponse(api_name, 'exception in /contract/accesslist')
    }
  },
  eth_subscribe: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_subscribe'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    if (!CONFIG.websocket.enabled || !CONFIG.websocket.serveSubscriptions) {
      callback({ message: 'Subscription feature disabled' } as JSONRPCError, null)
      return
    }
    try {
      const subscription_name = args[0]
      const filters = args[1]
      const sub_id = args[10]
      if (subscription_name !== 'logs') {
        logSubscriptionList.removeById(args[10])
        callback({ message: 'Shardeum only support logs subscriptions' } as JSONRPCError, null)
        countFailedResponse(api_name, 'Shardeum only support logs subscriptions')
        return
      }
      if (!filters.address && !filters.topics) {
        logSubscriptionList.removeById(args[10])
        callback({ message: 'Invalid Filters' } as JSONRPCError, null)
        countFailedResponse(api_name, 'Invalid Filters')
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
      countNonResponse('eth_subscribe', 'success')
    } catch (e: unknown) {
      logSubscriptionList.removeById(args[10])
      callback({ message: (e as Error).message } as JSONRPCError, null)
      countFailedResponse('eth_subscribe', (e as Error).message)
      // subscription failed, will not be tracking it
    }
  },

  eth_unsubscribe: async function (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) {
    const api_name = 'eth_unsubscribe'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    if (!CONFIG.websocket.enabled || !CONFIG.websocket.serveSubscriptions) {
      callback({ message: 'Subscription feature disabled' } as JSONRPCError, null)
      countFailedResponse(api_name, 'Subscription feature disabled')
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
      countNonResponse(api_name, 'success')
    } catch (e: unknown) {
      callback({ message: (e as Error).message } as JSONRPCError, null)
      countFailedResponse(api_name, (e as Error).message)
      // subscription failed, will not be tracking it
    }
  },
}
