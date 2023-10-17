import { AccessListEIP2930Transaction, Transaction, TxData } from '@ethereumjs/tx'
import { BN, bufferToHex, toBuffer } from 'ethereumjs-util'
import { createRejectTxStatus, recordTxStatus } from './api'
import whiteList from '../whitelist.json'
import axios from 'axios'
import { CONFIG as config } from './config'
import fs from 'fs'
import path from 'path'
import * as Types from './types'
// import crypto from '@shardus/crypto-utils'
import { getArchiverList, getFromArchiver } from '@shardus/archiver-discovery'
import { Archiver } from '@shardus/archiver-discovery/dist/src/types'
import execa from 'execa'
import { spawn } from 'child_process'

const crypto = require('@shardus/crypto-utils')

crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

const existingArchivers: Archiver[] = []

export const node = {
  ip: '127.0.0.1',
  port: 9001,
}

let badNodesMap: Map<string, number> = new Map()

const verbose = config.verbose
let gotArchiver = false
let nodeList: any[] = []
let nodeListMap: Map<string, any> = new Map()
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

// if tryInfinate value is true, it'll keep pinging the archiver unitl it responds infinitely, this is useful for first time updating NodeList
// linear complexity, O(n) where n is the amount of nodes object { ip: string, port number }
export async function updateNodeList(tryInfinate = false) {
  if (!healthyArchivers.length) await checkArchiverHealth()
  console.log(`Updating NodeList from ${getArchiverUrl().url}`)

  console.time('nodelist_update')
  const nRetry = tryInfinate ? -1 : 0 // infinitely retry or no retries
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

  const nodes = res.data.nodeList // <-
  nodeListMap = new Map() // clean old nodelist map

  if (nodes.length > 0) {
    if (nodes[0].ip === 'localhost' || nodes[0].ip === '127.0.0.1') {
      nodes.forEach((node: any) => {
        node.ip = getArchiverUrl().ip
      })
    }
    if (config.filterDeadNodesFromArchiver) {
      const allNodes = [...nodes]
      const onlineNodes = []
      let count = 0
      for (const node of allNodes) {
        count++
        try {
          const res = await axios({
            method: 'GET',
            url: `http://${node.ip}:${node.port}/nodeinfo`,
            timeout: 1000,
          })
          if (res.status !== 200) continue
          if (res.data.nodeInfo && res.data.nodeInfo.status === 'active') {
            console.log(`No. ${count} this node is ONLINE`, node.ip, node.port)
            onlineNodes.push(node)
            nodeListMap.set(`${node.ip}:${node.port}`, node)
          }
        } catch (e) {
          console.log(`No. ${count} this node is offline`, node.ip, node.port)
          continue
        }
      }
      nodeList = [...onlineNodes]
      if (verbose)
        console.log(`Nodelist is updated. All nodes ${allNodes.length}, online nodes ${onlineNodes.length}`)
    } else {
      for (const node of nodes) {
        nodeListMap.set(`${node.ip}:${node.port}`, node)
      }
      nodeList = [...nodes]
    }
  }
  console.timeEnd('nodelist_update')
}

export async function checkArchiverHealth() {
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
    } catch (error: any) {
      console.error(
        `Unreachable Archiver @ ${url.ip}:${url.port} | Error-code: ${error.errno} => ${error.code}`
      )
      return { url: `http://${url.ip}:${url.port}`, cycle_value: null }
    }
  })
  return Promise.all(counters)
}

export async function waitRandomSecond() {
  if (verbose) console.log(`Waiting before trying a different node`) // we don't need to wait here but doesn't hurt to wait a bit for perf
  await sleep(200)
}

function getTimeout(route: string) {
  let root = route.split('//')[1] ? route.split('//')[1].split('/')[1].split('?')[0] : null
  if (root && config.defaultRequestTimeout[root]) return config.defaultRequestTimeout[root]
  if (route.includes('full-nodelist')) return config.defaultRequestTimeout['full_nodelist']
  return config.defaultRequestTimeout[`default`]
}

// nRetry negative number will retry infinitely
export async function requestWithRetry(
  method: RequestMethod,
  route: string,
  data: any = {},
  nRetry = config.defaultRequestRetry,
  isFullUrl = false
) {
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
      let urlInfo = getBaseUrl()
      nodeUrl = urlInfo.baseUrl
      nodeIpPort = urlInfo.nodeIpPort
      url = `${nodeUrl}${route}`
    } else {
      url = route
    }
    try {
      if (verbose) console.log(`timeout for ${route} is ${getTimeout(route)}`)
      const res = await axios({
        method,
        url,
        data,
        timeout: getTimeout(route),
      })
      if (res.status === 200 && !res.data.error) {
        // success = true
        // we want to know which validator this is being injected to for debugging purposes
        if (typeof res.data === 'object') res.data.nodeUrl = nodeUrl
        return res //break
      }
    } catch (e: any) {
      console.log('Error: requestWithRetry', e, e.message)
      let badNodePercentage = badNodesMap.size / nodeList.length
      let shouldAddToBadNodeList = route.includes('eth_blockNumber')
      console.log(
        `shouldAddToBadNodeList: ${shouldAddToBadNodeList}, route: ${route}`,
        'badNodePercentage',
        badNodePercentage,
        'bad node count',
        badNodesMap.size
      )
      if (shouldAddToBadNodeList && nodeIpPort && badNodePercentage < 2 / 3) {
        // don't add to bad list if 2/3 of nodes are already bad
        badNodesMap.set(nodeIpPort, Date.now())
        console.log(`Adding node to bad nodes map: ${nodeIpPort}, total bad nodes: ${badNodesMap.size}`)
      }
    }

    if (retry <= maxRetry) {
      if (verbose) console.log('Node is busy...will try again to another node in a few seconds')
      await waitRandomSecond()
    } else {
      if (verbose) console.log('Node is busy...out of retries')
    }
  }
  return { data: { nodeUrl } }
}

export function getTransactionObj(tx: any): any {
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

export function intStringToHex(str: string) {
  return '0x' + new BN(str).toString(16)
}

export function getBaseUrl() {
  setConsensorNode()
  return { nodeIpPort: `${node.ip}:${node.port}`, baseUrl: `http://${node.ip}:${node.port}` }
}

export function getArchiverUrl() {
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

export function cleanBadNodes() {
  let now = Date.now()
  let threeMinutesInMs = 180000
  for (let [key, value] of badNodesMap.entries()) {
    if (now - value > threeMinutesInMs) {
      console.log(`Removing ${key} from badNodesMap`)
      badNodesMap.delete(key)
    }
  }
  console.log(`Current number of good nodes: ${nodeList.length - badNodesMap.size}`)
}

function rotateConsensorNode() {
  let count = 0
  let maxRetry = 10
  let success = false
  while (count < maxRetry && !success) {
    count++
    const consensor: any = getNextConsensorNode() //getRandomConsensorNode()
    let ipPort = `${consensor.ip}:${consensor.port}`
    if (consensor && !badNodesMap.has(ipPort)) {
      let nodeIp = consensor.ip
      //Sometimes the external IPs returned will be local IPs.  This happens with pm2 hosting multpile nodes on one server.
      //config.useConfigNodeIp will override the local IPs with the config node external IP when rotating nodes
      if (config.useConfigNodeIp === true) {
        nodeIp = config.nodeIpInfo.externalIp
      }
      changeNode(nodeIp, consensor.port)
      success = true
    }
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
export function setConsensorNode() {
  if (config.dynamicConsensorNode) {
    rotateConsensorNode()
  } else {
    changeNode(config.nodeIpInfo.externalIp, config.nodeIpInfo.externalPort)
  }
}

export function getRandomConsensorNode() {
  if (nodeList.length > 0) {
    const randomIndex = Math.floor(Math.random() * nodeList.length)
    return nodeList[randomIndex] // eslint-disable-line security/detect-object-injection
  }
}

/**
 * Round robin selection of next consensor index.
 * @returns
 */
export function getNextConsensorNode() {
  if (nodeList.length > 0) {
    nextIndex++
    if (nextIndex >= nodeList.length) {
      nextIndex = 0
    }
    return nodeList[nextIndex] // eslint-disable-line security/detect-object-injection
  }
}

function getNextArchiver() {
  if (healthyArchivers.length > 0) {
    if (archiverIndex === healthyArchivers.length) {
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

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true)
    }, ms)
  })
}

export async function getAccount(addressStr: any): Promise<{ account?: any; nodeUrl: string }> {
  const res = await requestWithRetry(RequestMethod.Get, `/account/${addressStr}`)
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
export async function getCode(addressStr: string): Promise<{ contractCode: string; nodeUrl: string }> {
  const res = await requestWithRetry(RequestMethod.Get, `/eth_getCode?address=${addressStr}`)
  return res.data
}

export class RequestersList {
  heavyRequests: Map<string, number[]>
  heavyAddresses: Map<string, number[]>
  abusedSenders: any
  abusedToAddresses: any
  bannedIps: any[]
  requestTracker: any
  allRequestTracker: any
  totalTxTracker: any
  blackListedSenders: Set<string>

  constructor(blackList: string[] = [], spammerList: string[] = []) {
    this.heavyRequests = new Map()
    this.heavyAddresses = new Map()
    this.abusedToAddresses = {}
    this.abusedSenders = new Map()
    this.blackListedSenders = new Set(spammerList)
    this.requestTracker = {}
    this.allRequestTracker = {}
    this.totalTxTracker = {}
    this.bannedIps = blackList.map((ip: string) => {
      return { ip, timestamp: Date.now() }
    })

    if (config.rateLimit) {
      setInterval(() => {
        this.clearOldIps()
      }, config.rateLimitOption.releaseFromBlacklistInterval * 3600 * 1000)
    }

    if (config.rateLimit) {
      setInterval(() => {
        this.checkAndBanSpammers()
      }, config.rateLimitOption.spammerCheckInterval * 60 * 1000)
    }
  }

  addToBlacklist(ip: string) {
    this.bannedIps.push({ ip, timestamp: Date.now() })
    try {
      fs.readFile(
        'blacklist.json',
        function (err: NodeJS.ErrnoException | null, currentDataStr: Buffer): void {
          const ipList = JSON.parse(currentDataStr.toString())
          if (ipList.indexOf(ip) >= 0) return
          const newIpList = [...ipList, ip]
          console.log(`Added ip ${ip} to banned list`)
          fs.writeFileSync('blacklist.json', JSON.stringify(newIpList))
        }
      )
    } catch (e) {
      console.log('Error writing to blacklist.json', e)
    }
  }

  addSenderToBacklist(address: string) {
    this.blackListedSenders.add(address.toLowerCase())
    try {
      fs.readFile(
        'spammerlist.json',
        function (err: NodeJS.ErrnoException | null, currentDataStr: Buffer): void {
          const spammerList = JSON.parse(currentDataStr.toString())
          if (spammerList.indexOf(address) >= 0) return
          const newSpammerList = [...spammerList, address]
          console.log(`Added address ${address} to spammer list`)
          fs.writeFileSync('spammerlist.json', JSON.stringify(newSpammerList))
        }
      )
    } catch (e) {
      console.log('Error writing to spammerlist.json', e)
    }
  }

  isSenderBlacklisted(address: string) {
    return this.blackListedSenders.has(address.toLowerCase())
  }

  clearOldIps() {
    /* eslint-disable security/detect-object-injection */
    const now = Date.now()
    const oneMinute = 60 * 1000
    for (const [ip, reqHistory] of this.heavyRequests) {
      if (verbose) console.log(`In last 60s, IP ${ip} made ${reqHistory.length} heavy requests`)
    }
    for (const [, reqHistory] of this.heavyRequests) {
      let i = 0
      for (; i < reqHistory.length; i++) {
        if (now - reqHistory[i] < oneMinute) break // we can stop looping the record array here
      }
      if (i > 0) reqHistory.splice(0, i - 1) // oldest item is at index 0
      //console.log('reqHistory after clearing heavy request history', reqHistory.length)
    }

    for (const [, reqHistory] of this.heavyAddresses) {
      let i = 0
      for (; i < reqHistory.length; i++) {
        if (now - reqHistory[i] < oneMinute) break // we can stop looping the record array here
      }
      if (i > 0) reqHistory.splice(0, i - 1) // oldest item is at index 0
      //console.log('reqHistory after clearing heavy request history', reqHistory.length)
    }

    // unban the ip after 1 hour
    this.bannedIps = this.bannedIps.filter((record: any) => {
      if (now - record.timestamp >= 60 * 60 * 1000) return false
      else return true
    })
    /* eslint-enable security/detect-object-injection */
  }

  checkAndBanSpammers() {
    // log and clean successful requests
    let records = Object.values(this.requestTracker)
    records = records.sort((a: any, b: any) => b.count - a.count)
    if (config.verbose) console.log('10 most frequent successful IPs:', records.slice(0, 10))

    // log and clean all requests
    let allRecords = Object.values(this.allRequestTracker)
    allRecords = allRecords.sort((a: any, b: any) => b.count - a.count)
    if (config.verbose)
      console.log('10 most frequent all IPs (rejected + successful):', allRecords.slice(0, 10))

    // log total injected tx by ip
    let txRecords = Object.values(this.totalTxTracker)
    txRecords = txRecords.sort((a: any, b: any) => b.count - a.count)
    for (let i = 0; i < txRecords.length; i++) {
      const txRecord: any = txRecords[i] // eslint-disable-line security/detect-object-injection
      if (txRecord.count >= allowedTxRate) {
        if (whiteList.indexOf(txRecord.ip) === -1) {
          if (config.rateLimit && config.rateLimitOption.banIpAddress) {
            console.log('Banned this ip due to continuously heavy requests', txRecord.ip)
            this.addToBlacklist(txRecord.ip)
          }
        }
      }
    }

    // log abused contract addresses
    const mostAbusedSorted: any[] = Object.values(this.abusedToAddresses).sort(
      (a: any, b: any) => b.count - a.count
    )
    for (const abusedData of mostAbusedSorted) {
      console.log(`Contract address: ${abusedData.to}. Count: ${abusedData.count}`)
      console.log(`Most frequent caller addresses:`)
      const sortedCallers: any[] = Object.values(abusedData.from).sort((a: any, b: any) => b.count - a.count)
      for (const caller of sortedCallers) {
        console.log(`    ${caller.from}, count: ${caller.count}`)
        const sortedIps: any[] = Object.values(caller.ips).sort((a: any, b: any) => b.count - a.count)
        for (const ip of sortedIps) {
          console.log(`             ${ip.ip}, count: ${ip.count}`)
        }
        if (caller.count > allowedTxRate && config.rateLimit && config.rateLimitOption.banSpammerAddress) {
          this.addSenderToBacklist(caller.from)
          console.log(
            `Caller ${caller.from} is added to spammer list due to sending spam txs to ${abusedData.to}`
          )
        }
      }
      console.log('------------------------------------------------------------')
    }

    // ban most abuse sender addresses
    const mostAbusedSendersSorted: any[] = Object.values(this.abusedSenders).sort(
      (a: any, b: any) => b.count - a.count
    )
    console.log('Top 10 spammer addresses: ', mostAbusedSendersSorted.slice(0, 10))
    for (const spammerInfo of mostAbusedSendersSorted) {
      if (spammerInfo.count > allowedTxRate && config.rateLimit && config.rateLimitOption.banSpammerAddress) {
        this.addSenderToBacklist(spammerInfo.address)
        console.log(
          `Caller ${spammerInfo.address} is added to spammer list due to sending more than ${allowedTxRate} txs within 5 min.`
        )
      }
    }
    console.log('Resetting rate-limit collector...')
    this.resetCollectors()
  }

  // clear things up for next collection
  resetCollectors() {
    this.requestTracker = {}
    this.allRequestTracker = {}
    this.totalTxTracker = {}
    this.heavyRequests = new Map()
    this.heavyAddresses = new Map()
    this.abusedSenders = new Map()
    this.abusedToAddresses = new Map()
  }

  addHeavyRequest(ip: string) {
    /*eslint-disable security/detect-object-injection */
    if (this.requestTracker[ip]) {
      this.requestTracker[ip].count += 1
    } else {
      this.requestTracker[ip] = { ip, count: 1 }
    }
    if (this.totalTxTracker[ip]) {
      this.totalTxTracker[ip].count += 1
    } else {
      this.totalTxTracker[ip] = { ip, count: 1 }
    }
    if (this.heavyRequests.get(ip)) {
      const reqHistory = this.heavyRequests.get(ip)
      if (reqHistory) reqHistory.push(Date.now())
    } else {
      this.heavyRequests.set(ip, [Date.now()])
    }
    /* eslint-enable security/detect-object-injection */
  }

  addHeavyAddress(address: string) {
    if (this.heavyAddresses.get(address)) {
      const reqHistory = this.heavyAddresses.get(address)
      if (reqHistory) reqHistory.push(Date.now())
    } else {
      this.heavyAddresses.set(address, [Date.now()])
    }
  }

  addAbusedSender(address: string) {
    /*eslint-disable security/detect-object-injection */
    console.log('adding abused sender', address)

    if (this.abusedSenders[address]) {
      this.abusedSenders[address].count += 1
    } else {
      this.abusedSenders[address] = {
        address,
        count: 1,
      }
    }
    /*eslint-enable security/detect-object-injection */
  }

  addAbusedAddress(toAddress: string, fromAddress: string, ip: string) {
    /*eslint-disable security/detect-object-injection */
    if (this.abusedToAddresses[toAddress]) {
      this.abusedToAddresses[toAddress].count += 1
      const fromData = this.abusedToAddresses[toAddress].from[fromAddress]
      if (fromData) {
        fromData.count += 1
        fromData.from = fromAddress
        if (fromData.ips[ip]) {
          fromData.ips[ip].count += 1
        } else {
          fromData.ips[ip] = { ip, count: 1 }
        }
      } else {
        const newFromData: any = {
          count: 1,
          from: fromAddress,
          ips: {},
        }
        newFromData.ips[ip] = {
          count: 1,
          ip,
        }
        this.abusedToAddresses[toAddress].from[fromAddress] = newFromData
      }
    } else {
      this.abusedToAddresses[toAddress] = {
        to: toAddress,
        count: 1,
        from: {},
      }
      const newFromData: any = {
        count: 1,
        from: fromAddress,
        ips: {},
      }
      newFromData.ips[ip] = {
        count: 1,
        ip,
      }
      this.abusedToAddresses[toAddress].from[fromAddress] = newFromData
    }
    /*eslint-enable security/detect-object-injection */
  }

  addAllRequest(ip: string) {
    /*eslint-disable security/detect-object-injection */
    if (this.allRequestTracker[ip]) {
      this.allRequestTracker[ip].count += 1
    } else {
      this.allRequestTracker[ip] = { ip, count: 1 }
    }
    /*eslint-enable security/detect-object-injection */
  }

  isIpBanned(ip: string) {
    if (config.rateLimit && config.rateLimitOption.banIpAddress) {
      const bannedIpList = this.bannedIps.map((data) => data.ip)
      if (bannedIpList.indexOf(ip) >= 0) return true
      else return false
    } else {
      return false
    }
  }

  isQueryType(reqType: string) {
    try {
      const heavyTypes = ['eth_sendRawTransaction', 'eth_sendTransaction']
      if (heavyTypes.indexOf(reqType) >= 0) return false
      // if (reqType === 'eth_call' && reqParams[0].data.indexOf('0x70a08231') === -1) {
      //   if(config.verbose) console.log('Not a balance query eth_call. Considered as heavy.')
      //   return false
      // }
      return true
    } catch (e) {
      return true
    }
  }

  async checkFaucetAccount(address: string, allowPlatform: string | null = null) {
    try {
      const url = `${config.faucetServerUrl}/faucet-claims/count?address=${address}&groupBy=platform`
      const res = await axios.get(url)
      if (res.data && res.data.count > 0) {
        if (!allowPlatform) return true
        if (res.data.groupBy[allowPlatform] > 0) return true //eslint-disable-line security/detect-object-injection
        return false
      } else return false
    } catch (e) {
      return false
    }
  }

  async isRequestOkay(ip: string, reqType: string, reqParams: any[]): Promise<boolean> {
    const now = Date.now()
    const oneMinute = 60 * 1000

    if (whiteList.indexOf(ip) >= 0) return true

    if (this.isIpBanned(ip)) {
      if (verbose) console.log(`This ip ${ip} is banned.`, reqType, reqParams)
      if (config.recordTxStatus && reqType === 'eth_sendRawTransaction') {
        const transaction = getTransactionObj({ raw: reqParams[0] })
        createRejectTxStatus(bufferToHex(transaction.hash()), 'This IP is banned.', ip)
      }
      return false
    }

    if (this.isQueryType(reqType)) {
      return true
    }

    // record this heavy request before checking
    this.addHeavyRequest(ip)
    const heavyReqHistory = this.heavyRequests.get(ip)

    if (heavyReqHistory && heavyReqHistory.length >= 61) {
      if (now - heavyReqHistory[heavyReqHistory.length - 61] < oneMinute) {
        if (verbose) console.log(`Ban this ip ${ip} due to continuously sending more than 60 reqs in 60s`)
        this.addToBlacklist(ip)
        if (config.recordTxStatus && reqType === 'eth_sendRawTransaction') {
          const transaction = getTransactionObj({ raw: reqParams[0] })
          createRejectTxStatus(bufferToHex(transaction.hash()), 'This IP is banned.', ip)
        }
        return false
      }
    }

    let transaction
    try {
      if (reqType === 'eth_sendRawTransaction') transaction = getTransactionObj({ raw: reqParams[0] })
    } catch (e) {}

    if (heavyReqHistory && heavyReqHistory.length >= config.rateLimitOption.allowedHeavyRequestPerMin) {
      if (
        now - heavyReqHistory[heavyReqHistory.length - config.rateLimitOption.allowedHeavyRequestPerMin] <
        oneMinute
      ) {
        if (verbose)
          console.log(
            `Your last heavy req is less than 60s ago`,
            `total requests: ${heavyReqHistory.length}, `,
            Math.round((now - heavyReqHistory[heavyReqHistory.length - 10]) / 1000),
            'seconds'
          )
        if (transaction) {
          if (verbose) console.log('tx rejected', bufferToHex(transaction.hash()))
          if (config.recordTxStatus)
            recordTxStatus({
              txHash: bufferToHex(transaction.hash()),
              ip: ip,
              raw: '',
              injected: false,
              accepted: false,
              reason: 'Rejected by JSON RPC rate limiting',
              timestamp: now,
            })
        }
        return false
      }
    }

    if (reqType === 'eth_sendRawTransaction') {
      try {
        const readableTx = {
          from: transaction.getSenderAddress().toString(),
          to: transaction.to ? transaction.to.toString() : '',
          value: transaction.value.toString(),
          data: bufferToHex(transaction.data),
          hash: bufferToHex(transaction.hash()),
        }
        if (readableTx.from) this.addHeavyAddress(readableTx.from)
        if (readableTx.to && readableTx.to !== readableTx.from) this.addHeavyAddress(readableTx.to)

        const fromAddressHistory = this.heavyAddresses.get(readableTx.from)

        if (
          config.rateLimit &&
          config.rateLimitOption.limitFromAddress &&
          this.isSenderBlacklisted(readableTx.from)
        ) {
          if (verbose) console.log(`Sender ${readableTx.from} is blacklisted.`)
          if (config.recordTxStatus)
            createRejectTxStatus(bufferToHex(transaction.hash()), 'Rejected by JSON RPC rate limiting', ip)
          return false
        }

        if (config.rateLimit && config.rateLimitOption.limitFromAddress) {
          if (fromAddressHistory && fromAddressHistory.length >= 10) {
            if (now - fromAddressHistory[fromAddressHistory.length - 10] < oneMinute) {
              if (verbose) console.log(`Your address ${readableTx.from} injected 10 txs within 60s`)
              if (config.recordTxStatus)
                createRejectTxStatus(
                  bufferToHex(transaction.hash()),
                  'Rejected by JSON RPC rate limiting',
                  ip
                )
              this.addAbusedAddress(readableTx.to, readableTx.from, ip)
              this.addAbusedSender(readableTx.from.toLowerCase())
              return false
            }
          }
        }

        if (config.rateLimit && config.rateLimitOption.limitToAddress) {
          const toAddressHistory = this.heavyAddresses.get(readableTx.to)
          if (toAddressHistory && toAddressHistory.length >= 10) {
            if (now - toAddressHistory[toAddressHistory.length - 10] < oneMinute) {
              this.addAbusedAddress(readableTx.to, readableTx.from, ip)
              if (verbose)
                console.log(`Last tx TO this contract address ${readableTx.to} is less than 60s ago`)

              if (config.rateLimitOption.allowFaucetAccount) {
                const isFaucetAccount = await this.checkFaucetAccount(
                  readableTx.from.toLowerCase(),
                  'discord'
                )
                if (isFaucetAccount) {
                  console.log(
                    `Allow address ${readableTx.from} to an abused contract because it is a faucet account`
                  )
                  return true
                }
              }

              if (config.recordTxStatus) {
                createRejectTxStatus(
                  bufferToHex(transaction.hash()),
                  'Rejected by JSON RPC rate limiting',
                  ip
                )
              }
              return false
            }
          }
        }
      } catch (e) {
        console.log('Error while get tx obj', e)
      }
    }
    if (heavyReqHistory && config.verbose) console.log(`We allow ip ${ip}`)
    return true
  }
}

export function hashSignedObj(obj: any) {
  if (!obj.sign) {
    return crypto.hashObj(obj)
  }
  return crypto.hashObj(obj, true)
}

export function calculateInternalTxHash(tx: any) {
  return '0x' + hashSignedObj(tx)
}

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

export function getFilterId(): string {
  // todo: use a better way to generate filter id
  return '0x' + Math.round(Math.random() * 1000000000).toString(16)
}

export function parseFilterDetails(filter: any) {
  // `filter.address` may be a single address or an array
  const addresses = filter.address
    ? (Array.isArray(filter.address) ? filter.address : [filter.address]).map((a: string) => a.toLowerCase())
    : []
  const topics = filter.topics ? filter.topics : []
  return { address: addresses[0], topics }
}

export async function fetchQueryExpb(query: string, maxRetries = 6) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const response = await axios.get(query)

      // if response indicates failure
      if (!response.data.transactions) {
        if (i === maxRetries) {
          throw new Error(`Failed to fetch after ${maxRetries} attempts: ${response.data.error}`)
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
}

export async function fetchTxReceiptFromArchiver(txHash: string) {
  const query = `${getArchiverUrl().url}/transaction?accountId=${txHash.substring(2)}`
  const response = await fetchQueryExpb(query).then((response) => {
    if (!response?.data?.transactions) {
      throw new Error('Failed to fetch transaction')
    } else return response
  })
  return response.data.transactions
}

export async function fetchTxReceipt(explorerUrl: string, txHash: string, hashReceipt = false) {
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

async function fetchAccountFromExplorer(explorerUrl: string, key: string, timestamp: number) {
  const accountKey = `0x${key.slice(0, -24)}`
  const apiQuery = `${explorerUrl}/api/transaction?address=${accountKey}&beforeTimestamp=${timestamp}`
  const txCount = await axios.get(apiQuery).then((response) => response.data.totalTransactions)
  if (txCount === 0) {
    // Account does not exist!
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

function isContractAccount(account: any) {
  const eoaCodeHash = [
    197, 210, 70, 1, 134, 247, 35, 60, 146, 126, 125, 178, 220, 199, 3, 192, 229, 0, 182, 83, 202, 130, 39,
    59, 123, 250, 216, 4, 93, 133, 164, 112,
  ]

  // Compare the code hash of the account to the EOA code hash
  return JSON.stringify(account.account.codeHash.data) !== JSON.stringify(eoaCodeHash)
}

async function fetchAccountFromArchiver(key: string, timestamp: number) {
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

async function fetchLatestAccount(key: string, type: number) {
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

async function fetchAccount(account: { type: number; key: string }, timestamp: number) {
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

export async function replayGas(tx: { from: string; gas: string } & TxData) {
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

  while (true) {
    const missingData: {
      status: string
      type: number
      shardusKey: string
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
    const downloadedAccount = await fetchLatestAccount(missingData[0].shardusKey, missingData[0].type)

    if (!downloadedAccount) {
      throw new Error('Account not found')
    }

    // Write downloaded data to file
    const statesFile = path.join(transactionsFolder, `estimate_${tx.from}_states.json`)

    const stateArray = fs.existsSync(statesFile) ? JSON.parse(fs.readFileSync(statesFile, 'utf8')) : []
    stateArray.push(downloadedAccount)

    fs.writeFileSync(statesFile, JSON.stringify(stateArray, undefined, 2))
  }
}

export async function replayTransaction(txHash: string, flag: string) {
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
    receipt = await fetchTxReceipt(config.explorerUrl, txHash)
    fs.writeFileSync(path.join(transactionsFolder, txHash + '.json'), JSON.stringify(receipt, undefined, 2))
  }

  if (!receipt) {
    throw new Error('Transaction not found')
  }

  while (true) {
    const missingData: {
      status: string
      type: number
      shardusKey: string
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
    const downloadedAccount = await fetchAccount(
      { key: missingData[0].shardusKey, type: missingData[0].type },
      receipt.timestamp
    )

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

export async function fetchStorage(txHash: string) {
  const receipt = await fetchTxReceipt(config.explorerUrl, txHash)
  const beforeStates: any[] = receipt.beforeStateAccounts
  const storageRecords = beforeStates.map((account) => {
    return {
      key: `0x${account.data.key}`,
      value: bufferToHex(account.data.value.data),
    }
  })
  return storageRecords
}

export enum TxStatusCode {
  BAD_TX = 0,
  SUCCESS = 1,
  BUSY = 2,
  OTHER_FAILURE = 3,
}

export function getReasonEnumCode(reason: string) {
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
  _REASONS.set('Transaction is not signed or signature is not valid.'.toLowerCase(), TxStatusCode.BAD_TX)
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
