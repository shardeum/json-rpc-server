const { Transaction, AccessListEIP2930Transaction } = require("@ethereumjs/tx");
import {Account, Address, BN, bufferToHex, isValidAddress, toBuffer} from 'ethereumjs-util'
import { recordTxStatus } from './api';
const whiteList = require("../whitelist.json")
const EventEmitter = require('events');
const axios = require("axios");
const config = require("./config")
const fs = require('fs')
export let node = {
    ip: 'localhost',
    port: 9001
}

let verbose = config.verbose
let gotArchiver = false
let nodeList: any[] = []
let nextIndex = 0
let allowedTxRate = config.rateLimitOption.allowedTxCountInCheckInterval

// if tryInfinate value is true, it'll keep pinging the archiver unitl it responds infinitely, this is useful for first time updating NodeList
export async function updateNodeList(tryInfinate: boolean = false) {
    const nRetry = tryInfinate ? -1 : 0 // infinitely retry or no retries
    if (config.askLocalHostForArchiver === true) {
        if (gotArchiver === false) {
            gotArchiver = true
            //TODO query a localhost (or other) node or a valid archiver IP
        }
    }

    // const res = await axios.get(`http://${config.archiverIpInfo.externalIp}:${config.archiverIpInfo.externalPort}/nodelist`)
    const res = await requestWithRetry('GET',`http://${config.archiverIpInfo.externalIp}:${config.archiverIpInfo.externalPort}/full-nodelist`, {},nRetry, true)

    const nodes = res.data.nodeList // <-
    if (nodes.length > 0) {
        nodeList = [...nodes]
        if (verbose) console.log('Nodelist is updated', nodeList.length)
    }
}

export async function waitRandomSecond() {
    let second = Math.floor(Math.random() * 5) + 1
    if (verbose) console.log(`Waiting ${second} second`)
    await sleep(second * 1000)
}

// nRetry negative number will retry infinitely
export async function requestWithRetry(method: string, route: string, data: any = {}, nRetry: number = 5, isFullUrl = false) {
    let retry = 0
    const IS_INFINITY: boolean = (nRetry < 0)
    let maxRetry = nRetry //set this to 0 with for load testing rpc server

    let success = false
    while ((retry <= maxRetry) || IS_INFINITY) {
        retry++
        try {
            // if (true) console.log(`Running request with retry: ${url} count: ${retry}`)
            let url
            if(!isFullUrl) url = `${getBaseUrl()}${route}`
            else url = route

            const res = await axios({
                method,
                url,
                data,
                timeout: 5000
            });
            if (res.status === 200 && !res.data.error) {
                // success = true
                return res //break
            }
        } catch (e: any) {
            console.log('Error: requestWithRetry', e.message)
        }

        if(retry <= maxRetry){
            if (verbose) console.log('Node is busy...will try again to another node in a few seconds')
            await waitRandomSecond()
        } else {
            if (verbose) console.log('Node is busy...out of retries')
        }
    }
    return { data: null }
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
    return `http://${node.ip}:${node.port}`
}

export function getArchiverUrl() {
    // http://localhost:4000/nodelist
  return `http://${config.archiverIpInfo.externalIp}:${config.archiverIpInfo.externalPort}`
}

export function changeNode(ip: string, port: number) {
    node.ip = ip
    node.port = port
    if (verbose) console.log(`RPC server subscribes to ${ip}:${port}`)
}

function rotateConsensorNode() {
    let consensor: any = getNextConsensorNode()//getRandomConsensorNode()
    if (consensor) {
        let nodeIp = consensor.ip
        //Sometimes the external IPs returned will be local IPs.  This happens with pm2 hosting multpile nodes on one server.
        //config.useConfigNodeIp will override the local IPs with the config node external IP when rotating nodes
        if (config.useConfigNodeIp === true) {
            nodeIp = config.nodeIpInfo.externalIp
        }
        changeNode(nodeIp, consensor.port)
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
        let randomIndex = Math.floor(Math.random() * nodeList.length)
        return nodeList[randomIndex]
    }
}

/**
 * Round robin selection of next consensor index.
 * @returns
 */
export function getNextConsensorNode() {
    if (nodeList.length > 0) {
        nextIndex++
        if(nextIndex >= nodeList.length){
            nextIndex = 0
        }
        return nodeList[nextIndex]
    }
}

export function sleep(ms: number) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(true)
        }, ms)
    })
}

export async function getAccount(addressStr: any) {
    try {
        let res = await requestWithRetry('get', `/account/${addressStr}`)
        return res.data.account
    } catch (e) {
        // console.log('getAccount error', e)
    }
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
      return {ip, timestamp: Date.now()}
    })
    let self = this
    if(config.rateLimit) {
      setInterval(() => {
        self.clearOldIps()
      }, config.rateLimitOption.releaseFromBlacklistInterval * 3600 * 1000)
    }

    if (config.rateLimit) {
      setInterval(() => {
        self.checkAndBanSpammers()
      }, config.rateLimitOption.spammerCheckInterval * 60 * 1000)
    }

  }

  addToBlacklist(ip: string) {
    this.bannedIps.push({ip, timestamp: Date.now()})
    fs.readFile('blacklist.json', function (err: any, currentDataStr: string) {
      const ipList = JSON.parse(currentDataStr)
      if (ipList.indexOf(ip) >= 0) return
      let newIpList = [...ipList, ip]
      console.log(`Added ip ${ip} to banned list`)
      fs.writeFileSync('blacklist.json', JSON.stringify(newIpList))
    })
  }

  addSenderToBacklist(address: string) {
    this.blackListedSenders.add(address.toLowerCase())
    fs.readFile('spammerlist.json', function (err: any, currentDataStr: string) {
      const spammerList = JSON.parse(currentDataStr)
      if (spammerList.indexOf(address) >= 0) return
      let newSpammerList = [...spammerList, address]
      console.log(`Added address ${address} to spammer list`)
      fs.writeFileSync('spammerlist.json', JSON.stringify(newSpammerList))
    })
  }

  isSenderBlacklisted(address: string) {
    return this.blackListedSenders.has(address.toLowerCase())
  }

  clearOldIps() {
    const now = Date.now()
    const oneMinute = 60 * 1000
    for (let [ip, reqHistory] of this.heavyRequests) {
      if(verbose) console.log(`In last 60s, IP ${ip} made ${reqHistory.length} heavy requests`)
    }
    for (let [ip, reqHistory] of this.heavyRequests) {
      let i = 0
      for (; i < reqHistory.length; i++) {
        if (now - reqHistory[i] < oneMinute) break // we can stop looping the record array here
      }
      if (i > 0) reqHistory.splice(0, i - 1) // oldest item is at index 0
      //console.log('reqHistory after clearing heavy request history', reqHistory.length)
    }

    for (let [address, reqHistory] of this.heavyAddresses) {
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
  }

  checkAndBanSpammers() {
    // log and clean successful requests
    let records = Object.values(this.requestTracker)
    records = records.sort((a: any, b: any) => b.count - a.count)
    if (config.verbose) console.log('10 most frequent successful IPs:', records.slice(0, 10))

    // log and clean all requests
    let allRecords = Object.values(this.allRequestTracker)
    allRecords = allRecords.sort((a: any, b: any) => b.count - a.count)
    if (config.verbose) console.log('10 most frequent all IPs (rejected + successful):', allRecords.slice(0, 10))

    // log total injected tx by ip
    let txRecords = Object.values(this.totalTxTracker)
    txRecords = txRecords.sort((a: any, b: any) => b.count - a.count)
    for (let i = 0; i < txRecords.length; i++) {
      let txRecord: any = txRecords[i]
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
    let mostAbusedSorted: any[] = Object.values(this.abusedToAddresses).sort((a: any, b: any) => b.count - a.count)
    for (let abusedData of mostAbusedSorted) {
      console.log(`Contract address: ${abusedData.to}. Count: ${abusedData.count}`)
      console.log(`Most frequent caller addresses:`)
      let sortedCallers: any[] = Object.values(abusedData.from).sort((a: any, b: any) => b.count - a.count)
      for (let caller of sortedCallers) {
        console.log(`    ${caller.from}, count: ${caller.count}`)
        let sortedIps: any[] = Object.values(caller.ips).sort((a: any, b: any) => b.count - a.count)
        for (let ip of sortedIps) {
          console.log(`             ${ip.ip}, count: ${ip.count}`)
        }
        if (caller.count > allowedTxRate && config.rateLimit && config.rateLimitOption.banSpammerAddress) {
          this.addSenderToBacklist(caller.from)
          console.log(`Caller ${caller.from} is added to spammer list due to sending spam txs to ${abusedData.to}`)
        }
      }
      console.log('------------------------------------------------------------')
    }

    // ban most abuse sender addresses
    let mostAbusedSendersSorted: any[] = Object.values(this.abusedSenders).sort((a: any, b: any) => b.count - a.count)
    console.log('Top 10 spammer addresses: ', mostAbusedSendersSorted.slice(0, 10))
    for (let spammerInfo of mostAbusedSendersSorted) {
      if (spammerInfo.count > allowedTxRate && config.rateLimit && config.rateLimitOption.banSpammerAddress) {
        this.addSenderToBacklist(spammerInfo.address)
        console.log(`Caller ${spammerInfo.address} is added to spammer list due to sending more than ${allowedTxRate} txs within 5 min.`)
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
    if (this.requestTracker[ip]) {
      this.requestTracker[ip].count += 1
    } else {
      this.requestTracker[ip] = {ip, count: 1}
    }
    if (this.totalTxTracker[ip]) {
      this.totalTxTracker[ip].count += 1
    } else {
      this.totalTxTracker[ip] = {ip, count: 1}
    }
    if (this.heavyRequests.get(ip)) {
      let reqHistory = this.heavyRequests.get(ip)
      if (reqHistory) reqHistory.push(Date.now())
    } else {
      this.heavyRequests.set(ip, [Date.now()])
    }
  }

  addHeavyAddress(address: string) {
    if (this.heavyAddresses.get(address)) {
      let reqHistory = this.heavyAddresses.get(address)
      if (reqHistory) reqHistory.push(Date.now())
    } else {
      this.heavyAddresses.set(address, [Date.now()])
    }
  }

  addAbusedSender(address: string) {
    console.log('adding abused sender', address);

    if (this.abusedSenders[address]) {
      this.abusedSenders[address].count += 1
    } else {
      this.abusedSenders[address] = {
        address,
        count: 1
      }
    }
  }

  addAbusedAddress(toAddress: string, fromAddress: string, ip: string) {
    if (this.abusedToAddresses[toAddress]) {
      this.abusedToAddresses[toAddress].count += 1
      let fromData = this.abusedToAddresses[toAddress].from[fromAddress]
      if (fromData) {
        fromData.count += 1
        fromData.from = fromAddress
        if (fromData.ips[ip]) {
          fromData.ips[ip].count += 1
        } else {
          fromData.ips[ip] = {ip, count: 1}
        }
      } else {
        let newFromData: any = {
          count: 1,
          from: fromAddress,
          ips: {}
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
      let newFromData: any = {
        count: 1,
        from: fromAddress,
        ips: {}
      }
      newFromData.ips[ip] = {
        count: 1,
        ip,
      }
      this.abusedToAddresses[toAddress].from[fromAddress] = newFromData
    }
  }

  addAllRequest(ip: string) {
    if (this.allRequestTracker[ip]) {
      this.allRequestTracker[ip].count += 1
    } else {
      this.allRequestTracker[ip] = {ip, count: 1}
    }
  }

  isIpBanned(ip: string) {
    if (config.rateLimit && config.rateLimitOption.banIpAddress) {
      let bannedIpList = this.bannedIps.map(data => data.ip)
      if (bannedIpList.indexOf(ip) >= 0) return true
      else return false
    } else {
      return false
    }
  }

  isQueryType(reqType: string, reqParams: any[]) {
    try {
      let heavyTypes = ['eth_sendRawTransaction', 'eth_sendTransaction']
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
      const url = `${config.faucetServerUrl}/faucet-claims/count?address=${address}`
      const res = await axios.get(url)
      if (res.data && res.data.count > 0) {
        if (!allowPlatform) return true
        if (res.data.groupBy[allowPlatform] > 0) return true
        return false
      } else return false
    } catch (e) {
      return false
    }
  }

  async isRequestOkay(ip: string, reqType: string, reqParams: any[]): Promise<boolean> {
    const now = Date.now()
    const oneMinute = 60 * 1000
    const oneSecond = 1000

    if (whiteList.indexOf(ip) >= 0) return true

    if (this.isIpBanned(ip)) {
      if(verbose) console.log(`This ip ${ip} is banned.`, reqType, reqParams)
      return false
    }

    if (this.isQueryType(reqType, reqParams)) {
      return true
    }

    // record this heavy request before checking
    this.addHeavyRequest(ip)
    let heavyReqHistory = this.heavyRequests.get(ip)

    if (heavyReqHistory && heavyReqHistory.length >= 61) {
      if (now - heavyReqHistory[heavyReqHistory.length - 61] < oneMinute) {
        if (verbose) console.log(`Ban this ip ${ip} due to continuously sending more than 60 reqs in 60s`)
        this.addToBlacklist(ip)
        return false
      }
    }

    let transaction
    try {
      if (reqType === 'eth_sendRawTransaction') transaction = getTransactionObj({raw: reqParams[0]})
    } catch (e) {

    }

    if (heavyReqHistory && heavyReqHistory.length >= config.rateLimitOption.allowedHeavyRequestPerMin) {
      if (now - heavyReqHistory[heavyReqHistory.length - config.rateLimitOption.allowedHeavyRequestPerMin] < oneMinute) {
        if (verbose) console.log(`Your last heavy req is less than 60s ago`, `total requests: ${heavyReqHistory.length}, `, Math.round((now - heavyReqHistory[heavyReqHistory.length - 10]) / 1000), 'seconds')
        if (transaction) {
          if (verbose) console.log('tx rejected', bufferToHex(transaction.hash()))
          if (config.recordTxStatus) recordTxStatus({
            txHash: bufferToHex(transaction.hash()),
            ip: ip,
            raw: '',
            injected: false,
            accepted: false,
            reason: 'Rejected by JSON RPC rate limiting',
            timestamp: now
          })
        }
        return false
      }
    }

    if (reqType === 'eth_sendRawTransaction') {
      try {
        let readableTx = {
          from: transaction.getSenderAddress().toString(),
          to: transaction.to ? transaction.to.toString() : '',
          value: transaction.value.toString(),
          data: bufferToHex(transaction.data),
          hash: bufferToHex(transaction.hash())
        }
        if (readableTx.from) this.addHeavyAddress(readableTx.from)
        if (readableTx.to && readableTx.to !== readableTx.from) this.addHeavyAddress(readableTx.to)

        let fromAddressHistory = this.heavyAddresses.get(readableTx.from)

        if (config.rateLimit && config.rateLimitOption.limitFromAddress && this.isSenderBlacklisted(readableTx.from)) {
          if (verbose) console.log(`Sender ${readableTx.from} is blacklisted.`)
          return false
        }

        if (config.rateLimit && config.rateLimitOption.limitFromAddress) {
          if (fromAddressHistory && fromAddressHistory.length >= 10) {
            if (now - fromAddressHistory[fromAddressHistory.length - 10] < oneMinute) {
              if (verbose) console.log(`Your address ${readableTx.from} injected 10 txs within 60s`)
              if (config.recordTxStatus) recordTxStatus({
                txHash: bufferToHex(transaction.hash()),
                raw: reqParams[0],
                ip: ip,
                injected: false,
                accepted: false,
                reason: 'Rejected by JSON RPC rate limiting',
                timestamp: now
              })
              this.addAbusedAddress(readableTx.to, readableTx.from, ip)
              this.addAbusedSender(readableTx.from.toLowerCase())
              return false
            }
          }
        }

        if (config.rateLimit && config.rateLimitOption.limitToAddress) {
          let toAddressHistory = this.heavyAddresses.get(readableTx.to)
          if (toAddressHistory && toAddressHistory.length >= 10) {
            if (now - toAddressHistory[toAddressHistory.length - 10] <  oneMinute) {
              this.addAbusedAddress(readableTx.to, readableTx.from, ip)
              if (verbose) console.log(`Last tx TO this contract address ${readableTx.to} is less than 60s ago`)

              if (config.rateLimitOption.allowFaucetAccount) {
                const isFaucetAccount = await this.checkFaucetAccount(readableTx.from.toLowerCase(), 'discord')
                if (isFaucetAccount) {
                  console.log(`Allow address ${readableTx.from} to an abused contract because it is a faucet account`)
                  return true
                }
              }

              if (config.recordTxStats) {
                recordTxStatus({
                  txHash: bufferToHex(transaction.hash()),
                  ip: ip,
                    raw: reqParams[0],
                    injected: false,
                    accepted: false,
                    reason: 'Rejected by JSON RPC rate limiting',
                    timestamp: now
                  })
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

export async function getTransactionReceipt(hash: string){
    let txHash = hash
    let res = await requestWithRetry('get', `/tx/${txHash}`)
    let result = res.data.account ? res.data.account.readableReceipt : null
    if (result) {
        if (!result.to || result.to == '') result.to = null
        if (result.logs == null) result.logs = []
        if (result.status == 0) result.status = '0x0'
        if (result.status == 1) result.status = '0x1'
    }
    return result
}

export enum TxStatusCode {
    BAD_TX = 0,
   SUCCESS = 1,
   BUSY = 2,
   OTHER_FAILURE = 3,
}
export function getReasonEnumCode(reason: string){
    const _REASONS = new Map();
    _REASONS.set('Maximum load exceeded.'.toLowerCase(),TxStatusCode.BUSY)
    _REASONS.set('Not ready to accept transactions, shard calculations pending'.toLowerCase(),TxStatusCode.BUSY)
    _REASONS.set('Network conditions to allow transactions are not met.'.toLowerCase(),TxStatusCode.BUSY)
    _REASONS.set('Network conditions to allow app init via set'.toLowerCase(),TxStatusCode.BUSY)

    _REASONS.set('Transaction timestamp cannot be determined.'.toLowerCase(),TxStatusCode.BAD_TX)
    _REASONS.set('Transaction Expired'.toLowerCase(),TxStatusCode.BAD_TX)
    _REASONS.set('Dev key is not defined on the server!'.toLowerCase(),TxStatusCode.BAD_TX)
    _REASONS.set('Invalid signature'.toLowerCase(),TxStatusCode.BAD_TX)
    _REASONS.set('Transaction is not valid. Cannot get txObj.'.toLowerCase(),TxStatusCode.BAD_TX)
    _REASONS.set('Transaction is not signed or signature is not valid.'.toLowerCase(),TxStatusCode.BAD_TX)
    _REASONS.set('Cannot derive sender address from tx'.toLowerCase(),TxStatusCode.BAD_TX)

    _REASONS.set('Transaction queued, poll for results.'.toLowerCase(),TxStatusCode.SUCCESS)

    const code = _REASONS.get(reason.toLowerCase())

    return code ? code : TxStatusCode.OTHER_FAILURE
}
