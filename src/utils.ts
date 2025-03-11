import { AccessListEIP2930Transaction, Transaction, TxData } from '@ethereumjs/tx'
import { BN, bufferToHex, toBuffer } from 'ethereumjs-util'
import { createRejectTxStatus, recordTxStatus } from './api'
import whiteList from '../whitelist.json'
import axios from 'axios'
import { CONFIG as config } from './config'
import fs from 'fs'
import path from 'path'
import { getArchiverList } from '@shardeum-foundation/lib-archiver-discovery'
import { Archiver } from '@shardeum-foundation/lib-archiver-discovery/dist/src/types'
import execa from 'execa'
import { spawn } from 'child_process'
import { collectorAPI } from './external/Collector'
import { serviceValidator } from './external/ServiceValidator'
import { AxiosResponse } from 'axios'
import * as crypto from '@shardeum-foundation/lib-crypto-utils'
import {
  Node,
  Filter,
  TransactionFromArchiver,
  TransactionFromExplorer,
  NodeJSError,
  ReceiptFromExplorer,
  WrappedDataContractStorage,
  IpData,
  ToData,
  FromData,
  OriginalTxData,
  AccountTypesData,
  Account2,
  InternalFilter,
} from './types'
import Sntp from '@hapi/sntp'
import { randomBytes, createHash } from 'crypto'
import net from 'net'
import { TTLMap } from './utils/TTLMap'
import { loadFoundationNodes, isFoundationNode, isFoundationNodeFilteringEnabled } from './utils/foundationNodes'

crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

const existingArchivers: Archiver[] = []
const timeServers = ['0.pool.ntp.org', '1.pool.ntp.org', '2.pool.ntp.org', '3.pool.ntp.org']
let ntpOffset = 0

export const node = {
  ip: '127.0.0.1',
  port: 9001,
}

const NETWORK_ACCOUNT_CACHE_TTL = 30 * 1000 // Convert 30 seconds to milliseconds
const networkAccountSnapshotCache = new TTLMap<any>() // Snapshot Cache

let rotationEdgeToAvoid = 0

const badNodesMap: Map<string, number> = new Map()

const verbose = config.verbose
const verboseRequestWithRetry = config.verboseRequestWithRetry
let gotArchiver = false
let nodeList: Node[] = []
let nodeListMap: Map<string, Node> = new Map()
let nextIndex = 0
const allowedTxRate = config.rateLimitOption.allowedTxCountInCheckInterval

type ArchiverStat = {
  url: string
  cycle_value: number | null
}
let maxCycleValue = 0
let healthyArchivers: ArchiverStat[] = []
let archiverIndex = 0

export enum RequestMethod {
  Get = 'get',
  Post = 'post',
}

export async function initSyncTime() {
  for (const host of timeServers) {
    const time = await Sntp.time({
      host,
      timeout: 10000,
    })

    ntpOffset = Math.floor(time.t)

    if (isNaN(ntpOffset)) {
      ntpOffset = 0
    }
    return
  }
}

export function getSyncTime(): number {
  return Date.now() + ntpOffset
}

async function checkIfNodeIsActive(node: Node): Promise<boolean> {
  try {
    const res = await axios({
      method: 'GET',
      url: `http://${node.ip}:${node.port}/nodeinfo`,
      timeout: 10000,
    })
    if (res.status !== 200) return false
    if (res.data.nodeInfo?.status === 'active') {
      return true
    }
  } catch (e) {
    return false
  }
  return false
}

// if tryInfinite value is true, it'll keep pinging the archiver unitl it responds infinitely, this is useful for first time updating NodeList
// linear complexity, O(n) where n is the amount of nodes object { ip: string, port number }
export async function updateNodeList(tryInfinite = false): Promise<void> {
  if (!healthyArchivers.length) await checkArchiverHealth()
  console.log(`Updating NodeList from ${getArchiverUrl().url}`)

  // Load foundation nodes once per cycle
  if (config.foundationNodeFilter.enabled) {
    await loadFoundationNodes()
  }

  console.time('nodelist_update')
  const nRetry = tryInfinite ? -1 : 5 // infinitely retry or 5 retries if initial request fails
  if (config.askLocalHostForArchiver === true) {
    if (gotArchiver === false) {
      gotArchiver = true
      //TODO query a localhost (or other) node or a valid archiver IP
    }
  }

  const res = await requestWithRetry(
    RequestMethod.Get,
    `${getArchiverUrl().url}/full-nodelist?activeOnly=true`,
    {},
    nRetry,
    true
  )

  const nodes: Node[] = res.data.nodeList // <-
  nodeListMap = new Map() // clean old nodelist map

  if (nodes.length > 0) {
    if (nodes[0].ip === 'localhost' || nodes[0].ip === '127.0.0.1') {
      nodes.forEach((node: Node) => {
        node.ip = getArchiverUrl().ip
      })
    }
    if (config.filterDeadNodesFromArchiver) {
      //const promises = nodes.map(checkIfNodeIsActive) //dont blast all requests at once

      const concurrentRequests = 50
      const semaphore = new Semaphore(concurrentRequests)
      const results: boolean[] = new Array(nodes.length).fill(false)

      const waitForAllPromise = new Deferred<void>()
      let finished = 0
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        //promises.push(checkIfNodeIsActive(node)) //not stacking up promises
        //@ts-ignore what are we using es5 for?
        async function throttledNodeCheck(node: Node, index: number) {
          await semaphore.wait()
          try {
            let res = await checkIfNodeIsActive(node)
            results[index] = res
          } finally {
            semaphore.signal()
            finished++
            if (finished >= nodes.length) {
              waitForAllPromise.resolve()
            }
          }
        }
        throttledNodeCheck(node, i)
      }

      //wait for finished count
      await waitForAllPromise

      //const results = await Promise.all(promises)
      const activeNodes = nodes.filter((_, index) => results[index])
      nodeList = activeNodes
      if (verbose)
        console.log(`Nodelist is updated. All nodes ${nodes.length}, online nodes ${activeNodes.length}`)
    } else {
      for (const node of nodes) {
        nodeListMap.set(`${node.ip}:${node.port}`, node)
      }
      nodeList = [...nodes]
    }
  }
  console.timeEnd('nodelist_update')
}

export async function getNodeList(page: number, limit: number): Promise<any> {
  try {
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedNodeList = nodeList.slice(startIndex, endIndex)

    return {
      nodes: paginatedNodeList,
      totalNodes: nodeList.length,
      page: page,
      limit: limit,
      totalPages: Math.ceil(nodeList.length / limit),
    }
  } catch (error) {
    console.error('Error in getNodeList:', error)
    throw error
  }
}

export async function getNetworkAccount(): Promise<any> {
  try {
    let cachedAccount = await networkAccountSnapshotCache.get('networkAccountCache')

    if (!cachedAccount) {
      const response = await axios.get(`${getArchiverUrl().url}/get-network-account?hash=false`)
      cachedAccount = response.data
      networkAccountSnapshotCache.set('networkAccountCache', cachedAccount, NETWORK_ACCOUNT_CACHE_TTL)
    }

    return cachedAccount
  } catch (error) {
    console.error('Error fetching network account:', error)
    throw error
  }
}

export function removeFromNodeList(ip: string, port: string): void {
  nodeList = nodeList.filter((node) => node.ip !== ip || node.port !== Number(port))
}

export async function updateEdgeNodeConfig(): Promise<void> {
  console.log(`Updating rotationEdgeToAvoid configuration`)

  const res = await requestWithRetry(RequestMethod.Get, `/netconfig`)

  if (res.data && res.data.config) {
    const newRotationEdgeToAvoid = res.data.config.p2p.rotationEdgeToAvoid
    rotationEdgeToAvoid = newRotationEdgeToAvoid
    console.log(`Setting rotationEdgeToAvoid to ${newRotationEdgeToAvoid}`)
  } else if (res.data && res.data.error) {
    console.log(`Error getting rotationEdgeToAvoid configuration: ${res.data.error}`)
  }
}

export async function checkArchiverHealth(): Promise<void> {
  console.info('\n====> Checking Health of Archivers <====')
  const archiverData: ArchiverStat[] = await getArchiverStats()
  console.table(archiverData, ['url', 'cycle_value'])
  healthyArchivers = archiverData.filter((a: ArchiverStat) => a.cycle_value === maxCycleValue)
  console.log(`-->> ${healthyArchivers.length} Healthy Archivers active in the Network <<--`)
}

async function getArchiverStats(): Promise<ArchiverStat[]> {
  if (existingArchivers.length === 0) {
    const archivers = await getArchiverList({
      customConfigPath: 'archiverConfig.json',
    })
    existingArchivers.push(...archivers)
  }
  const counters = existingArchivers.map(async (url) => {
    try {
      const res = await axios.get(`http://${url.ip}:${url.port}/cycleinfo/1`)
      if (res?.data?.cycleInfo[0].counter > maxCycleValue) {
        maxCycleValue = res?.data?.cycleInfo[0].counter
      }

      return { url: `http://${url.ip}:${url.port}`, cycle_value: res?.data?.cycleInfo[0].counter }
    } catch (error: unknown) {
      console.error(
        `Unreachable Archiver @ ${url.ip}:${url.port} | Error-code: ${(error as NodeJSError).errno} => ${(error as NodeJSError).code
        }`
      )
      return { url: `http://${url.ip}:${url.port}`, cycle_value: null }
    }
  })
  return Promise.all(counters)
}

export async function waitRandomSecond(): Promise<void> {
  if (verbose) console.log(`Waiting before trying a different node`) // we don't need to wait here but doesn't hurt to wait a bit for perf
  await sleep(200)
}

// TODO: check what happens if theres no type assertion
function getTimeout(route: string): number {
  // const root = route.split('//')[1] ? route.split('//')[1].split('/')[1].split('?')[0] : null
  // // If 'root' exists and is a key in 'config.defaultRequestTimeout', return its corresponding value.
  // // The type assertion ensures 'root' is treated as a key of 'config.defaultRequestTimeout' for TypeScript.
  // if (root && 'defaultRequestTimeout' in config && root in config.defaultRequestTimeout) {
  //   return config.defaultRequestTimeout[root as keyof typeof config.defaultRequestTimeout]
  // }
  // if (route.includes('full-nodelist')) return config.defaultRequestTimeout['full_nodelist']
  // return config.defaultRequestTimeout[`default`]

  //get rid of regex.

  for (const key of Object.keys(config.defaultRequestTimeout)) {
    if (route.includes(key)) {
      const requestKey = key as keyof typeof config.defaultRequestTimeout
      const timeout = config.defaultRequestTimeout[requestKey]
      if (timeout > 0) {
        return timeout
      }
    }
  }
  return config.defaultRequestTimeout[`default`]
}

// nRetry negative number will retry infinitely
export async function requestWithRetry(
  method: RequestMethod,
  route: string,
  data: object = {},
  nRetry = config.defaultRequestRetry,
  isFullUrl = false,
  responseCheck: (data: any) => boolean = () => true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  let retry = 0
  const IS_INFINITY: boolean = nRetry < 0
  const maxRetry = nRetry //set this to 0 with for load testing rpc server

  let nodeUrl
  while (retry <= maxRetry || IS_INFINITY) {
    retry++
    let url
    let nodeIpPort
    let nodeUrl
    if (!isFullUrl) {
      const urlInfo = getBaseUrl()
      nodeUrl = urlInfo.baseUrl
      nodeIpPort = urlInfo.nodeIpPort
      url = `${nodeUrl}${route}`
    } else {
      url = route
    }
    const timeout = getTimeout(route)
    try {
      if (verboseRequestWithRetry && verbose) console.log(`timeout for ${route} is ${timeout}`)
      const queryStartTime = Date.now()
      const res = await axios({
        method,
        url,
        data,
        timeout,
      })
      if (res.status === 200 && !res.data.error) {
        const isValidResponse = responseCheck(res.data)

        const totalTime = Date.now() - queryStartTime
        if (verboseRequestWithRetry) console.log(`success:  route: ${route}`, 'totalTime', totalTime)
        // success = true
        // we want to know which validator this is being injected to for debugging purposes
        if (isValidResponse) {
          if (typeof res.data === 'object') res.data.nodeUrl = nodeUrl
          return res //break
        }
      } else if (res.data.error === 'node close to rotation edges') {
        console.log(`${nodeUrl} Node is close to rotation edges. Changing node...`)
        if (nodeIpPort) {
          const urlParts = nodeIpPort.split(':')
          removeFromNodeList(urlParts[0], urlParts[1])
        }
      }
    } catch (e: unknown) {
      if (verbose && verboseRequestWithRetry) console.log('Error: requestWithRetry', e, (e as Error).message)
      const badNodePercentage = badNodesMap.size / nodeList.length
      const shouldAddToBadNodeList = route.includes('eth_blockNumber')
      if (verboseRequestWithRetry)
        console.log(
          `FAIL:     route: ${route}`,
          `shouldAddToBadNodeList: ${shouldAddToBadNodeList}`,
          'badNodePercentage',
          badNodePercentage,
          'bad node count',
          badNodesMap.size,
          'timeout',
          timeout,
          //@ts-ignore
          e?.message
        )
      if (shouldAddToBadNodeList && nodeIpPort && badNodePercentage < 2 / 3) {
        // don't add to bad list if 2/3 of nodes are already bad
        badNodesMap.set(nodeIpPort, Date.now())
        if (verboseRequestWithRetry && verbose)
          console.log(`Adding node to bad nodes map: ${nodeIpPort}, total bad nodes: ${badNodesMap.size}`)
      }
    }

    if (retry <= maxRetry) {
      if (verbose) console.log(`(Attempt ${retry}) Node is unable to respond. Trying a new node.`)
      await waitRandomSecond()
    } else if (route.includes('/account/')) {
      // Not able to find account after all retries
      // This can happen in the case of accounts that have not been used yet
      // or are uninitialized. Return null account to be handled by the caller
      return { data: { account: null } }
    } else {
      if (verbose) console.log('Request was unsuccessful after all retries.')
    }
  }
  return { data: { nodeUrl } }
}

export function getTransactionObj(tx: OriginalTxData): Transaction | AccessListEIP2930Transaction {
  if (!tx.raw) throw Error('No raw tx found.')
  let transactionObj
  const serializedInput = toBuffer(tx.raw)
  try {
    transactionObj = Transaction.fromRlpSerializedTx(serializedInput)
    // if (verbose) console.log('Legacy tx parsed:', transactionObj)
  } catch (e) {
    // if (verbose) console.log('Unable to get legacy transaction obj', e)
  }
  if (!transactionObj) {
    try {
      transactionObj = AccessListEIP2930Transaction.fromRlpSerializedTx(serializedInput)
      if (verbose) console.log('EIP2930 tx parsed:', transactionObj)
    } catch (e) {
      console.log('Unable to get EIP2930 transaction obj', e)
    }
  }

  if (transactionObj) {
    return transactionObj
  } else throw Error('tx obj fail')
}

export function intStringToHex(str: string): string {
  return '0x' + new BN(str).toString(16)
}

export function getBaseUrl(): { nodeIpPort: string; baseUrl: string } {
  setConsensorNode()
  return { nodeIpPort: `${node.ip}:${node.port}`, baseUrl: `http://${node.ip}:${node.port}` }
}

export function getArchiverUrl(): { url: string; ip: string; port: number } {
  return getNextArchiver()
}

/**
 * It mutate the `node` object which decide which node rpc will make request to
 * @param {string} ip
 * @param {number} port
 * @param {bool} default: false, when set true, it'll ensure ip and port provided is actually in the nodelist
 */
export function changeNode(ip: string, port: number, strict = false): boolean {
  if (strict === true && nodeListMap.has(ip + ':' + port)) {
    node.ip = ip
    node.port = port
    if (verbose) console.log(`RPC server subscribes to ${ip}:${port}`)
    return true
  }
  if (strict === true && !nodeListMap.has(ip)) {
    return false
  }
  node.ip = ip
  node.port = port
  if (verbose) console.log(`RPC server subscribes to ${ip}:${port}`)
  return true
}

export function cleanBadNodes(): void {
  const now = Date.now()
  const threeMinutesInMs = 180000
  for (const [key, value] of badNodesMap.entries()) {
    if (now - value > threeMinutesInMs) {
      console.log(`Removing ${key} from badNodesMap`)
      badNodesMap.delete(key)
    }
  }
  console.log(`Current number of good nodes: ${nodeList.length - badNodesMap.size}`)
}

function rotateConsensorNode(): void {
  let count = 0
  const maxRetry = 10
  let success = false
  const foundationFilterEnabled = isFoundationNodeFilteringEnabled()

  while (count < maxRetry && !success) {
    count++
    const consensor: Node | null = config.useRoundRobinConsensorSelection
      ? getNextConsensorNode()
      : getRandomConsensorNode()

    if (!consensor) continue;

    const ipPort = `${consensor.ip}:${consensor.port}`
    // Skip if node is in bad nodes map
    if (badNodesMap.has(ipPort)) continue;

    // Skip if foundation node filtering is enabled and this is not a foundation node
    if (foundationFilterEnabled && !isFoundationNode(ipPort)) {
      // decrement count so skipping this non foundation node doesn't count as a retry
      count--
      continue
    } 

    let nodeIp = consensor.ip
    //Sometimes the external IPs returned will be local IPs.  This happens with pm2 hosting multpile nodes on one server.
    //config.useConfigNodeIp will override the local IPs with the config node external IP when rotating nodes
    if (config.useConfigNodeIp === true) {
      nodeIp = config.nodeIpInfo.externalIp
    }
    changeNode(nodeIp, consensor.port)
    success = true
  }

  // If we couldn't find a foundation node after max retries, fall back to any node
  if (!success && foundationFilterEnabled) {
    console.log('Could not find a suitable foundation node after max retries, falling back to any node')
    rotateConsensorNodeWithoutFilter();
  }
}

export { rotateConsensorNode }

function rotateConsensorNodeWithoutFilter(): void {
  let count = 0
  const maxRetry = 10
  let success = false

  while (count < maxRetry && !success) {
    count++
    const consensor: Node | null = config.useRoundRobinConsensorSelection
      ? getNextConsensorNode()
      : getRandomConsensorNode()

    if (!consensor) continue;

    const ipPort = `${consensor.ip}:${consensor.port}`

    // Skip if node is in bad nodes map
    if (badNodesMap.has(ipPort)) continue;

    let nodeIp = consensor.ip
    if (config.useConfigNodeIp === true) {
      nodeIp = config.nodeIpInfo.externalIp
    }
    changeNode(nodeIp, consensor.port)
    success = true
  }
}

// export function apiStatCollector(methodName: any, args: string[]) {
//     let now = Math.round(Date.now() / 1000)
//     if (perfTracker[methodName]) {
//         perfTracker[methodName].push(true)
//     } else {
//         perfTracker[methodName] = [true]
//     }
// }

// this is the main function to be called every RPC request
export function setConsensorNode(): void {
  if (config.dynamicConsensorNode) {
    rotateConsensorNode()
  } else {
    changeNode(config.nodeIpInfo.externalIp, config.nodeIpInfo.externalPort)
  }
}

export function getRandomConsensorNode(): Node | null {
  if (nodeList.length > 0) {
    const randomIndex = Math.floor(Math.random() * nodeList.length)
    return nodeList[randomIndex] // eslint-disable-line security/detect-object-injection
  }
  return null
}

/**
 * Round robin selection of next consensor index.
 * @returns
 */
export function getNextConsensorNode(): Node | null {
  if (nodeList.length > 0) {
    nextIndex++
    if (nextIndex >= nodeList.length) {
      nextIndex = 0
    }
    return nodeList[nextIndex] // eslint-disable-line security/detect-object-injection
  }
  return null
}

function getNextArchiver(): { url: string; ip: string; port: number } {
  if (healthyArchivers.length > 0) {
    if (archiverIndex >= healthyArchivers.length) {
      archiverIndex = 0
    }
    const archiver = healthyArchivers[Number(archiverIndex)]
    archiverIndex++
    const [ip, port] = archiver.url.split('//')[1].split(':')
    return { url: archiver.url, ip, port: Number(port) }
  } else {
    console.error('🔴-> No Healthy Archivers in the Network. Terminating Server. <-🔴')
    process.exit(0)
  }
}

export function sleep(ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true)
    }, ms)
  })
}

export async function getAccountFromValidator(
  addressStr: string
): Promise<{ account?: Account2; nodeUrl?: string }> {
  function responseCheck(data: any): boolean {
    return data.account != null
  }
  const res = await requestWithRetry(
    RequestMethod.Get,
    `/account/${addressStr}`,
    {},
    8,
    undefined,
    responseCheck
  )
  return res.data
}

export async function getGasPrice(): Promise<{ result?: string }> {
  const res = await requestWithRetry(RequestMethod.Get, `/eth_gasPrice`)
  return res.data
}

/**
 * Gets the contract code associated with a given address
 * @param addressStr
 * @returns
 */
export async function getCode(
  addressStr: string,
  blockNumber?: string
): Promise<{ contractCode: string; nodeUrl: string }> {
  let url = `/eth_getCode?address=${addressStr}`
  if (blockNumber) {
    url += `&blockNumber=${blockNumber}`
  }
  const res = await requestWithRetry(RequestMethod.Get, url)
  return res.data
}

export function hashSignedObj(obj: object): string {
  if (!('sign' in obj)) {
    return crypto.hashObj(obj)
  }
  return crypto.hashObj(obj, true)
}

export function calculateInternalTxHash(tx: object): string {
  return '0x' + hashSignedObj(tx)
}

/*
export async function getTransactionReceipt(hash: string) {
  const txHash = hash
  const res = await requestWithRetry(RequestMethod.Get, `/tx/${txHash}`)
  const result = res.data.account ? res.data.account.readableReceipt : null
  if (result) {
    if (!result.to || result.to == '') result.to = null
    if (result.logs == null) result.logs = []
    if (result.status == 0) result.status = '0x0'
    if (result.status == 1) result.status = '0x1'
  }
  return result
}
*/

export function getFilterId(): string {
  return (
    '0x' +
    createHash('sha256')
      .update(randomBytes(16).toString('hex') + Date.now())
      .digest('hex')
  )
}

export function parseFilterDetails(filter: Filter): { address: string; topics: string[] } {
  // `filter.address` may be a single address or an array
  const addresses = filter.address
    ? (Array.isArray(filter.address) ? filter.address : [filter.address]).map((a: string) => a.toLowerCase())
    : []
  const topics = filter.topics ? filter.topics : []
  return { address: addresses[0], topics }
}

export async function fetchQueryExpb(
  query: string,
  maxRetries = 6
): Promise<AxiosResponse<{ transactions: TransactionFromArchiver }> | null> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const response = await axios.get<{ transactions: TransactionFromArchiver }>(query)

      // if response indicates failure
      if (!response.data.transactions) {
        if (i === maxRetries) {
          // check with script
          throw new Error(`Failed to fetch after ${maxRetries} attempts.`)
        }

        // wait for a bit before retrying
        console.log(`Failed to fetch, retrying in ${Math.pow(2, i)} seconds...`)
        console.log(`Query is ${query}`)
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 1000))
        continue
      }

      return response
    } catch (error) {
      // if max attempts reached, rethrow the error
      if (i === maxRetries) {
        throw error
      }

      // wait for a bit before retrying
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 1000))
    }
  }
  return null
}

export async function fetchTxReceiptFromArchiver(txHash: string): Promise<TransactionFromArchiver> {
  const query = `${getArchiverUrl().url}/transaction?accountId=${txHash.substring(2)}`
  const response = await fetchQueryExpb(query).then((response) => {
    if (!response?.data?.transactions) {
      throw new Error('Failed to fetch transaction')
    } else return response
  })
  return response.data.transactions
}

export async function fetchTxReceipt(
  explorerUrl: string,
  txHash: string,
  hashReceipt = false
): Promise<TransactionFromExplorer | ReceiptFromExplorer> {
  const apiQuery = `${explorerUrl}/api/transaction?txHash=${txHash}`
  const response = await axios.get(apiQuery).then((response) => {
    if (!response) {
      throw new Error('Failed to fetch transaction')
    } else return response
  })

  if (hashReceipt) {
    return response.data.transactions[0]
  }

  const txId = response.data.transactions[0].txId
  const receiptQuery = `${explorerUrl}/api/receipt?txId=${txId}`
  const receipt = await axios.get(receiptQuery).then((response) => response.data.receipts)
  return receipt
}

async function fetchAccountFromExplorer(
  explorerUrl: string,
  key: string,
  timestamp: number
): Promise<{ accountId: string; data: AccountTypesData } | undefined> {
  const accountKey = `0x${key.slice(0, -24)}`
  const apiQuery = `${explorerUrl}/api/transaction?address=${accountKey}&beforeTimestamp=${timestamp}`
  const txCount = await axios.get(apiQuery).then((response) => response.data.totalTransactions)
  if (txCount === 0) {
    // Explorer doesnt have enough transaction history on this account
    return undefined
  }

  let i = 1
  const numberOfPages = Math.ceil(txCount / 10)
  for (i; i <= numberOfPages; i++) {
    // Fetch current page
    const txList = await axios
      .get(apiQuery.concat(`&page=${i}`))
      .then((response) => response.data.transactions)
      .then((txList) =>
        txList.map((tx: { txId: string; timestamp: number }) => {
          return { txId: tx.txId, timestamp: tx.timestamp }
        })
      )

    for (const tx of txList) {
      const foundAccount = await axios
        .get(`${explorerUrl}/api/receipt?txId=${tx.txId}`)
        .then((response) => response.data.receipts.accounts)
        .then((accounts) => {
          return accounts.find((account: { accountId: string }) => account.accountId === key)
        })

      if (foundAccount) {
        return {
          accountId: foundAccount.accountId,
          data: foundAccount.data,
        }
      }
    }
  }

  return undefined
}

function isContractAccount(account: AccountTypesData): boolean {
  const eoaCodeHash = [
    197, 210, 70, 1, 134, 247, 35, 60, 146, 126, 125, 178, 220, 199, 3, 192, 229, 0, 182, 83, 202, 130, 39,
    59, 123, 250, 216, 4, 93, 133, 164, 112,
  ]

  // Compare the code hash of the account to the EOA code hash
  if ('account' in account && account.account) {
    return JSON.stringify(account.account.codeHash.data) !== JSON.stringify(eoaCodeHash)
  }
  return false
}

async function fetchAccountFromArchiver(
  key: string,
  timestamp: number
): Promise<{ accountId: string; data: AccountTypesData } | undefined> {
  const res = await requestWithRetry(
    RequestMethod.Get,
    `${getArchiverUrl().url}/account?accountId=${key}`,
    {},
    0,
    true
  )
  // TODO: Fix bug where timestamp are same. Latest transaction is being replayed.
  if (!res.data.accounts) {
    return undefined
  } else if (isContractAccount(res.data.accounts.data)) {
    // Contract Account
    return {
      accountId: res.data.accounts.accountId,
      data: res.data.accounts.data,
    }
  } else if (res.data.accounts.timestamp < timestamp) {
    return {
      accountId: res.data.accounts.accountId,
      data: res.data.accounts.data,
    }
  } else if (res.data.accounts.timestamp > timestamp) {
    return undefined
  } else if (res.data.accounts.timestamp === timestamp && res.data.accounts.data.account.nonce === '00') {
    // The EOA has only had one TX so far which we are replaying
    const blankAccount = {
      timestamp: 0,
      account: {
        nonce: '00',
        balance: '00',
        stateRoot: {
          type: 'Buffer',
          data: [
            86, 232, 31, 23, 27, 204, 85, 166, 255, 131, 69, 230, 146, 192, 248, 110, 91, 72, 224, 27, 153,
            108, 173, 192, 1, 98, 47, 181, 227, 99, 180, 33,
          ],
        },
        codeHash: {
          type: 'Buffer',
          data: [
            197, 210, 70, 1, 134, 247, 35, 60, 146, 126, 125, 178, 220, 199, 3, 192, 229, 0, 182, 83, 202,
            130, 39, 59, 123, 250, 216, 4, 93, 133, 164, 112,
          ],
        },
      },
      ethAddress: `0x${key.slice(0, -24)}`,
      accountType: 0,
      hash: 'd89934f85367efac5f0c1cd4789e6b20f7c529f91b6eff4a626185c0c7fddd76',
    }

    return {
      accountId: key,
      data: blankAccount,
    }
  } else {
    return undefined
  }
}

async function fetchLatestAccount(
  key: string,
  type: number
): Promise<{ accountId: string; data: AccountTypesData } | undefined> {
  console.log('Fetching latest account', key)
  const res = await requestWithRetry(
    RequestMethod.Get,
    `${getArchiverUrl().url}/account?accountId=${key}`,
    {},
    3,
    true
  )

  if (!res.data.accounts) {
    if (type === 0) {
      // EOA/CA
      const blankAccount = {
        timestamp: 0,
        account: {
          nonce: '00',
          balance: '00',
          stateRoot: {
            type: 'Buffer',
            data: [
              86, 232, 31, 23, 27, 204, 85, 166, 255, 131, 69, 230, 146, 192, 248, 110, 91, 72, 224, 27, 153,
              108, 173, 192, 1, 98, 47, 181, 227, 99, 180, 33,
            ],
          },
          codeHash: {
            type: 'Buffer',
            data: [
              197, 210, 70, 1, 134, 247, 35, 60, 146, 126, 125, 178, 220, 199, 3, 192, 229, 0, 182, 83, 202,
              130, 39, 59, 123, 250, 216, 4, 93, 133, 164, 112,
            ],
          },
        },
        ethAddress: `0x${key.slice(0, -24)}`,
        accountType: 0,
        hash: 'd89934f85367efac5f0c1cd4789e6b20f7c529f91b6eff4a626185c0c7fddd76',
      }

      return {
        accountId: key,
        data: blankAccount,
      }
    } else if (type === 1) {
      // Contract Storage
      return {
        accountId: key,
        data: {
          accountType: 1,
          ethAddress: '',
          hash: '',
          timestamp: 0,
          value: {},
        },
      }
    } else if (type === 2) {
      // Contract Code
      return {
        accountId: key,
        data: {
          accountType: 2,
          ethAddress: '',
          hash: '',
          timestamp: 0,
          codeHash: {
            data: [],
            type: 'Buffer',
          },
          codeByte: {
            data: [],
            type: 'Buffer',
          },
        },
      }
    } else {
      return undefined
    }
  }

  return {
    accountId: res.data.accounts.accountId,
    data: res.data.accounts.data,
  }
}

async function fetchLatestAccountFromCollector(account: { shardusKey: string; type: number; key: string }) {
  const query = account.type == 2 ? account.key.slice(2) : account.shardusKey
  const res = await collectorAPI.fetchAccount(query)
  // Check if the response contains account data
  if (!res || !res.data || !res.data.accounts) {
    if (verbose) console.log('No data found in collector section')
    // No account data found
    return undefined
  } else {
    // Account data found, return the required information
    return { accountId: account.shardusKey, data: res.data.accounts[0].account }
  }
}

async function fetchAccountFromCollector(
  account: { shardusKey: string; type: number; key: string },
  timestamp: number
) {
  const { shardusKey, type, key } = account
  // Check for the type of account to fetch
  if (type === 0) {
    // In case of EOA, use shardusKey obtained from the REPLAY ENGINE
    if (verbose) console.log('Fetching data for EOA/CA')
    return await collectorAPI.fetchTxHistory(shardusKey, timestamp)
  } else if (type === 1) {
    // Contract Storage
    // throw new Error('Replay engine should never get here')
    return undefined
  } else if (type === 2) {
    // Contract Code
    // Use Account.Key, obtained from the replay engine
    if (verbose) console.log('Fetching data for Contract Code')
    const accountKey = key.slice(2) // Remove the leading '0x' from the key
    const res = await collectorAPI.fetchAccount(accountKey)

    // Check if the response contains account data
    if (!res || !res.data || !res.data.accounts) {
      // No account data found
      return {
        accountId: key,
        data: { accountType: 2, ethAddress: '', hash: '', timestamp: 0 },
      }
    } else {
      // Account data found, return the required information
      return { accountId: shardusKey, data: res.data.accounts[0].account }
    }
  } else {
    return undefined
  }
}

async function fetchAccount(
  account: { type: number; key: string },
  timestamp: number
): Promise<{ accountId: string; data: AccountTypesData } | undefined | null> {
  if (account.type === 0) {
    // EOA/CA
    let result = await fetchAccountFromArchiver(account.key, timestamp)
    if (!result) {
      result = await fetchAccountFromExplorer(config.explorerUrl, account.key, timestamp)
    }
    return result
  } else if (account.type === 1) {
    // Contract Storage
    // throw new Error('Replay engine should never get here')
    return undefined
  } else if (account.type === 2) {
    // Contract Code
    let result
    const res = await requestWithRetry(
      RequestMethod.Get,
      `${getArchiverUrl().url}/account?accountId=${account.key}`,
      {},
      0,
      true
    )
    if (!res.data.accounts) {
      result = {
        accountId: account.key,
        data: {
          accountType: 2,
          ethAddress: '',
          hash: '',
          timestamp: 0,
        },
      }
    } else {
      result = { accountId: account.key, data: res.data.accounts.data }
    }

    return result
  } else {
    return undefined
  }
}

export async function replayGas(tx: { from: string; gas: string } & TxData): Promise<string[]> {
  /* eslint-disable security/detect-non-literal-fs-filename */
  const gasLimit = tx.gas ? tx.gas : '0x1C9C380'

  const txData = {
    ...tx,
    gasLimit,
  }

  // Create estimate-receipt to pass to replay engine
  const receiptObject = {
    txData,
  }

  const replayPath = path.join(__dirname, '../../../validator/dist/src/debug/replayTX.js')
  const transactionsFolder = path.join(__dirname, '../../transactions')

  // Check if replay script exists
  if (!fs.existsSync(replayPath)) {
    throw new Error('Replay script not found')
  }

  // Create transactions folder if it doesn't exist
  if (!fs.existsSync(transactionsFolder)) {
    fs.mkdirSync(transactionsFolder)
  }

  fs.writeFileSync(
    path.join(transactionsFolder, `estimate_${tx.from}.json`),
    JSON.stringify(receiptObject, undefined, 2)
  )

  // Delete estimate_states.json if it exists
  if (fs.existsSync(path.join(transactionsFolder, `estimate_${tx.from}_states.json`))) {
    fs.unlinkSync(path.join(transactionsFolder, `estimate_${tx.from}_states.json`))
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const missingData: {
      status: string
      type: number
      shardusKey: string
      key: string
    }[] = []
    const { stdout, stderr } = await execa(
      'node',
      [replayPath, path.join(transactionsFolder, `estimate_${tx.from}.json`)],
      {
        reject: false,
      }
    )

    // Check if stderr is empty
    if (stderr === '') {
      console.log('RESULT: ', stdout.split('\n')[0])
      return stdout.split('\n').slice(0, 2)
    }

    // Split stdout into lines
    stdout
      .split('\n')
      .filter((line: string) => line !== '')
      .forEach((line: string) => {
        missingData.push(JSON.parse(line))
      })

    // Download missing data
    let downloadedAccount = await fetchLatestAccountFromCollector({
      shardusKey: missingData[0].shardusKey,
      type: missingData[0].type,
      key: missingData[0].key,
    })

    // console.log("the downloaded is", missingData[0].key, missingData[0].shardusKey, downloadedAccount)

    if (!downloadedAccount) {
      if (verbose) console.log('We are fetching from the archiver and not collector')
      downloadedAccount = await fetchLatestAccount(missingData[0].shardusKey, missingData[0].type)
    }

    if (!downloadedAccount) {
      throw new Error('Account not found')
    }

    // Write downloaded data to file
    const statesFile = path.join(transactionsFolder, `estimate_${tx.from}_states.json`)

    const stateArray = fs.existsSync(statesFile) ? JSON.parse(fs.readFileSync(statesFile, 'utf8')) : []
    stateArray.push(downloadedAccount)

    fs.writeFileSync(statesFile, JSON.stringify(stateArray, undefined, 2))
  }
  /* eslint-enable security/detect-non-literal-fs-filename */
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function replayTransaction(txHash: string, flag: string): Promise<any> {
  /* eslint-disable security/detect-non-literal-fs-filename */

  const replayPath = path.join(__dirname, '../../../validator/dist/src/debug/replayTX.js')
  const transactionsFolder = path.join(__dirname, '../../transactions')

  // Check if replay already exists
  if (fs.existsSync(path.join(transactionsFolder, txHash + '_states.json'))) {
    const child = spawn('node', [replayPath, path.join(transactionsFolder, txHash + '.json'), flag])

    let output = ''

    child.stdout.on('data', (data) => {
      output += data
    })

    child.on('close', (code) => {
      if (code !== 0) {
        throw new Error('Replay script exited with non-zero exit code ' + code)
      }
      return JSON.parse(output)
    })
  }

  // Check if replay script exists
  if (!fs.existsSync(replayPath)) {
    throw new Error('Replay script not found')
  }

  // Create transactions folder if it doesn't exist
  if (!fs.existsSync(transactionsFolder)) {
    fs.mkdirSync(transactionsFolder)
  }

  // Download TX file
  let receipt
  if (fs.existsSync(path.join(transactionsFolder, txHash + '.json'))) {
    receipt = JSON.parse(fs.readFileSync(path.join(transactionsFolder, txHash + '.json'), 'utf8'))
  } else {
    receipt = await collectorAPI.getTxReceiptDetails(txHash)
    if (!receipt) {
      if (verbose) console.log('Receipt not sourced from collector; trying with explorer')
      receipt = await fetchTxReceipt(config.explorerUrl, txHash)
    }
    fs.writeFileSync(path.join(transactionsFolder, txHash + '.json'), JSON.stringify(receipt, undefined, 2))
  }

  if (!receipt) {
    throw new Error('Transaction not found')
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const missingData: {
      status: string
      type: number
      shardusKey: string
      key: string
    }[] = []
    const { stdout } = await execa('node', [replayPath, path.join(transactionsFolder, txHash + '.json')], {
      reject: false,
    })

    if (stdout.trim() === 'Done') {
      break
    }

    // Split stdout into lines
    stdout
      .split('\n')
      .filter((line: string) => line !== '')
      .forEach((line: string) => {
        missingData.push(JSON.parse(line))
      })

    // Download missing data
    let downloadedAccount = await fetchAccountFromCollector(
      { shardusKey: missingData[0].shardusKey, type: missingData[0].type, key: missingData[0].key },
      receipt.timestamp
    )

    if (!downloadedAccount) {
      // this fetches data from the archiver or the explorer in case the collector fails
      if (verbose) console.log('We are fetching from the archiver and not collector')
      downloadedAccount = await fetchAccount(
        { key: missingData[0].shardusKey, type: missingData[0].type },
        receipt.timestamp
      )
    }

    if (!downloadedAccount) {
      throw new Error('Account not found')
    }

    // Write downloaded data to file
    const statesFile = path.join(transactionsFolder, txHash + '_states.json')
    const stateArray = fs.existsSync(statesFile) ? JSON.parse(fs.readFileSync(statesFile, 'utf8')) : []
    stateArray.push(downloadedAccount)

    fs.writeFileSync(statesFile, JSON.stringify(stateArray, undefined, 2))
  }

  const { stdout } = await execa('node', [replayPath, path.join(transactionsFolder, txHash + '.json'), flag])
  return JSON.parse(stdout)
  /* eslint-enable security/detect-non-literal-fs-filename */
}

export function parseAndValidateStringInput(input: string): Buffer {
  if (input.slice(0, 2).toLowerCase() !== '0x') {
    throw new Error(
      `Cannot wrap string value "${input}" as a json-rpc type; strings must be prefixed with "0x".`
    )
  }

  let hexValue = input.slice(2)

  // hexValue must be an even number of hexadecimal characters in order to correctly decode in Buffer.from
  // see: https://nodejs.org/api/buffer.html#buffers-and-character-encodings
  if (hexValue.length & 1) {
    hexValue = `0${hexValue}`
  }
  const byteLength = Math.ceil(input.length / 2 - 1)

  const _buffer = Buffer.from(hexValue, 'hex')
  if (_buffer.length !== byteLength) {
    // Buffer.from will return the result after encountering an input that does not conform to hexadecimal encoding.
    // this means that an invalid input can never return a value with the expected bytelength.
    throw new Error(
      `Cannot wrap string value "${input}" as a json-rpc type; the input value contains an invalid hex character.`
    )
  }

  return _buffer
}

export async function fetchStorage(txHash: string): Promise<{ key: string; value: string }[]> {
  const receipt = (await fetchTxReceipt(config.explorerUrl, txHash)) as ReceiptFromExplorer
  const beforeStates = receipt.beforeStateAccounts
  const storageRecords = beforeStates.map((account) => {
    return {
      key: `0x${(account.data as unknown as WrappedDataContractStorage).key}`,
      value: bufferToHex(Buffer.from((account.data as unknown as WrappedDataContractStorage).value.data)),
    }
  })
  return storageRecords
}

export function calculateContractStorageAccountId(contractAddress: string, slotId: string): string {
  if (contractAddress.length != 42) {
    throw new Error('must pass in a 42 character hex address for Account type ContractStorage.')
  }

  //we need to take a hash, to prevent collisions
  const hashedSuffixKey = crypto.hash(slotId + contractAddress)

  const contractStoragePrefixBitLength = 3

  // Special case for 3-bit prefix. We combine the first nibble of the address with the last nibble of the key.
  // Please refer to the default case for more details. For the special case we use shorthands for optimization.
  if (contractStoragePrefixBitLength === 3) {
    const combinedNibble = (
      (parseInt(contractAddress[2], 16) & 14) |
      // eslint-disable-next-line security/detect-object-injection
      (parseInt(hashedSuffixKey[0], 16) & 1)
    ).toString(16)

    return (combinedNibble + hashedSuffixKey.slice(1)).toLowerCase()
  }

  const fullHexChars = Math.floor(contractStoragePrefixBitLength / 4)
  const remainingBits = contractStoragePrefixBitLength % 4

  let prefix = contractAddress.slice(2, 2 + fullHexChars)
  let suffix = hashedSuffixKey.slice(fullHexChars)

  // Handle the overlapping byte if there are remaining bits
  if (remainingBits > 0) {
    const prefixLastNibble = parseInt(contractAddress[2 + fullHexChars], 16)
    // eslint-disable-next-line security/detect-object-injection
    const suffixFirstNibble = parseInt(hashedSuffixKey[fullHexChars], 16)

    // Shift the prefix byte to the left and mask the suffix nibble, then combine them
    const suffixMask = (1 << (4 - remainingBits)) - 1
    const shiftedSuffixNibble = suffixFirstNibble & suffixMask
    const prefixMask = (1 << 4) - 1 - suffixMask
    const shiftedPrefixNibble = prefixLastNibble & prefixMask
    const combinedNibble = shiftedPrefixNibble | shiftedSuffixNibble
    const combinedHex = combinedNibble.toString(16)

    prefix += combinedHex
    // Adjust the suffix to remove the processed nibble
    suffix = hashedSuffixKey.slice(fullHexChars + 1)
  }

  let shardusAddress = prefix + suffix
  shardusAddress = shardusAddress.toLowerCase()
  return shardusAddress
}

export enum TxStatusCode {
  BAD_TX = 0,
  SUCCESS = 1,
  BUSY = 2,
  OTHER_FAILURE = 3,
}

export function getReasonEnumCode(reason: string): TxStatusCode {
  const _REASONS = new Map()
  _REASONS.set('Maximum load exceeded.'.toLowerCase(), TxStatusCode.BUSY)
  _REASONS.set(
    'Not ready to accept transactions, shard calculations pending'.toLowerCase(),
    TxStatusCode.BUSY
  )
  _REASONS.set('Network conditions to allow transactions are not met.'.toLowerCase(), TxStatusCode.BUSY)
  _REASONS.set('Network conditions to allow app init via set'.toLowerCase(), TxStatusCode.BUSY)

  _REASONS.set('Transaction timestamp cannot be determined.'.toLowerCase(), TxStatusCode.BAD_TX)
  _REASONS.set('Transaction Expired'.toLowerCase(), TxStatusCode.BAD_TX)
  _REASONS.set('Dev key is not defined on the server!'.toLowerCase(), TxStatusCode.BAD_TX)
  _REASONS.set('Invalid signature'.toLowerCase(), TxStatusCode.BAD_TX)
  _REASONS.set('Transaction is not valid. Cannot get txObj.'.toLowerCase(), TxStatusCode.BAD_TX)
  _REASONS.set('Not enough gas to execute transaction'.toLowerCase(), TxStatusCode.BAD_TX)
  _REASONS.set('Transaction is not signed'.toLowerCase(), TxStatusCode.BAD_TX)
  _REASONS.set('Transaction signature is invalid'.toLowerCase(), TxStatusCode.BAD_TX)
  _REASONS.set('Cannot derive sender address from tx'.toLowerCase(), TxStatusCode.BAD_TX)

  _REASONS.set('Transaction queued, poll for results.'.toLowerCase(), TxStatusCode.SUCCESS)

  const code = _REASONS.get(reason.toLowerCase())

  return code ? code : TxStatusCode.OTHER_FAILURE
}

export function hexToBN(hexString: string): BN {
  if (hexString.startsWith('0x')) {
    hexString = hexString.slice(2) // remove the '0x' prefix
  }
  return new BN(hexString, 16)
}

function isValidIP(ip: string): boolean {
  return net.isIP(ip) !== 0 // Returns 4 for IPv4, 6 for IPv6, or 0 for invalid
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535
}

export function sanitizeIpAndPort(ipPort: string): { isValid: boolean; error?: string } {
  const [ip, portStr] = ipPort.split(':')

  // Check if both IP and port are provided
  if (!ip || !portStr) {
    return { isValid: false, error: 'IP and port must both be provided' }
  }

  // Validate IP
  if (!isValidIP(ip)) {
    return { isValid: false, error: 'Invalid IP address' }
  }

  // Convert port to a number and validate
  const port = Number(portStr)
  if (!isValidPort(port)) {
    return { isValid: false, error: 'Invalid port number' }
  }

  return { isValid: true }
}

export function removeOldestFilter(filtersMap: Map<string, InternalFilter>): void {
  let oldestKey: string | undefined
  let oldestTimestamp = Infinity

  // Iterate through the map to find the oldest entry
  for (const [key, value] of filtersMap) {
    if (value.filter.lastQueriedTimestamp < oldestTimestamp) {
      oldestTimestamp = value.filter.lastQueriedTimestamp
      oldestKey = key
    }
  }

  // Remove the oldest entry
  if (oldestKey !== undefined) {
    filtersMap.delete(oldestKey)
  }
}

class Semaphore {
  private queue: (() => void)[] = []
  private value: number

  constructor(maxConcurrency: number) {
    this.value = maxConcurrency
  }

  async wait(): Promise<void> {
    return new Promise<void>((resolve) => {
      const tryAcquire = () => {
        if (this.value > 0) {
          this.value--
          resolve()
        } else {
          this.queue.push(tryAcquire)
        }
      }
      tryAcquire()
    })
  }

  signal(): void {
    this.value++
    if (this.queue.length > 0) {
      const next = this.queue.shift()
      if (next) {
        next()
      }
    }
  }
}

class Deferred<T> {
  public promise: Promise<T>
  public resolve!: (value: T | PromiseLike<T>) => void
  public reject!: (reason?: any) => void

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
}
