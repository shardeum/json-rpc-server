import { CONFIG as config } from '../../config'
import { bufferToHex } from 'ethereumjs-util'
import { IpData, ToData, FromData, BlacklistData, RequestTracker, AbusedSender } from './types'
import { ONE_MINUTE, ONE_HOUR } from './constants'
import { writeToBlacklist, writeToSpammerList, getTransactionObj, writeNewBlacklistWithRetry } from './utils'
import axios from 'axios'
export class RequestersList {
  heavyRequests: Map<string, number[]>
  heavyAddresses: Map<string, number[]>
  abusedSenders: Map<string, AbusedSender>
  abusedToAddresses: Map<string, ToData>
  bannedIps: BlacklistData[]
  requestTracker: RequestTracker
  allRequestTracker: Record<string, IpData>
  totalTxTracker: Record<string, IpData>
  blackListedSenders: Set<string>
  whiteList: Set<string>
  private clearOldIpsInterval: NodeJS.Timeout | null = null
  private checkAndBanSpammersInterval: NodeJS.Timeout | null = null

  constructor(blackList: string[] = [], spammerList: string[] = [], whiteList: string[] = []) {
    this.heavyRequests = new Map()
    this.heavyAddresses = new Map()
    this.abusedToAddresses = new Map()
    this.abusedSenders = new Map()
    this.blackListedSenders = new Set(spammerList)
    this.requestTracker = {}
    this.allRequestTracker = {}
    this.totalTxTracker = {}
    this.bannedIps = blackList.map((ip: string) => {
      return { ip, timestamp: Date.now() }
    })
    this.whiteList = new Set(whiteList)

    if (config.rateLimit) {
      // ensure configs are set and are numbers
      if (!config.rateLimitOption.releaseFromBlacklistInterval || !config.rateLimitOption.spammerCheckInterval) {
        throw new Error('Rate limit options are not set correctly')
      }

      if (
        typeof config.rateLimitOption.releaseFromBlacklistInterval !== 'number' ||
        typeof config.rateLimitOption.spammerCheckInterval !== 'number'
      ) {
        throw new Error('Rate limit options are not set correctly: must be numbers')
      }

      this.clearOldIpsInterval = setInterval(() => {
        this.clearOldIps()
      }, config.rateLimitOption.releaseFromBlacklistInterval * 60 * 1000)
    }

    if (config.rateLimit) {
      this.checkAndBanSpammersInterval = setInterval(() => {
        this.checkAndBanSpammers()
      }, config.rateLimitOption.spammerCheckInterval * 60 * 1000)
    }
  }

  addToBlacklist(ip: string): void {
    // Don't blacklist whitelisted IPs
    if (this.whiteList.has(ip)) {
      if (config.verbose) console.log(`IP ${ip} is whitelisted, cannot be blacklisted`)
      return
    }

    // Don't add if already blacklisted
    if (this.bannedIps.some((record) => record.ip === ip)) {
      if (config.verbose) console.log(`IP ${ip} is already in the banned list`)
      return
    }

    this.bannedIps.push({ ip, timestamp: Date.now() })
    if (config.verbose) console.log(`Attempting to add IP ${ip} to blacklist`)

    writeToBlacklist(ip)
  }

  addSenderToBacklist(address: string): void {
    this.blackListedSenders.add(address.toLowerCase())
    writeToSpammerList(address)
  }

  isSenderBlacklisted(address: string): boolean {
    return this.blackListedSenders.has(address.toLowerCase())
  }

  clearOldIps(): void {
    /* eslint-disable security/detect-object-injection */
    const now = Date.now()

    // Log heavy requests
    for (const [ip, reqHistory] of this.heavyRequests) {
      if (config.verbose) console.log(`In last 60s, IP ${ip} made ${reqHistory.length} heavy requests`)
    }

    // Clear old heavy requests
    for (const [, reqHistory] of this.heavyRequests) {
      let i = 0
      // Find index of first request less than a minute old
      while (i < reqHistory.length && now - reqHistory[i] >= ONE_MINUTE) {
        i++
      }
      // Remove all elements older than a minute (0 to i-1)
      if (i > 0) {
        reqHistory.splice(0, i)
      }
    }

    // Clear old heavy addresses
    for (const [, reqHistory] of this.heavyAddresses) {
      let i = 0
      // Find index of first request less than a minute old
      while (i < reqHistory.length && now - reqHistory[i] >= ONE_MINUTE) {
        i++
      }
      // Remove all elements older than a minute (0 to i-1)
      if (i > 0) {
        reqHistory.splice(0, i)
      }
    }

    // unban the ip after 1 hour and ensure synchronization
    const previousLength = this.bannedIps.length
    this.bannedIps = this.bannedIps.filter((record) => {
      if (now - record.timestamp >= ONE_HOUR) {
        if (config.verbose) console.log(`Removing IP ${record.ip} from banned list`)
        return false
      }
      return true
    })

    if (this.bannedIps.length !== previousLength) {
      writeNewBlacklistWithRetry(this.bannedIps.map((record) => record.ip))
    }
  }

  checkAndBanSpammers(): void {
    // log and clean successful requests
    let records = Object.values(this.requestTracker)
    records = records.sort((a: IpData, b: IpData) => b.count - a.count)
    if (config.verbose) console.log('10 most frequent successful IPs:', records.slice(0, 10))

    // log and clean all requests
    let allRecords = Object.values(this.allRequestTracker)
    allRecords = allRecords.sort((a: IpData, b: IpData) => b.count - a.count)
    if (config.verbose) console.log('10 most frequent all IPs (rejected + successful):', allRecords.slice(0, 10))

    // log total injected tx by ip
    let txRecords = Object.values(this.totalTxTracker)
    txRecords = txRecords.sort((a: IpData, b: IpData) => b.count - a.count)
    for (let i = 0; i < txRecords.length; i++) {
      const txRecord: IpData = txRecords[i] // eslint-disable-line security/detect-object-injection
      if (txRecord.count >= config.rateLimitOption.allowedTxCountInCheckInterval) {
        if (!this.whiteList.has(txRecord.ip)) {
          if (config.rateLimit && config.rateLimitOption.banIpAddress) {
            if (config.verbose) console.log('Banned this ip due to continuously heavy requests', txRecord.ip)
            this.addToBlacklist(txRecord.ip)
          }
        }
      }
    }

    // log abused contract addresses
    const mostAbusedSorted: ToData[] = Object.values(this.abusedToAddresses).sort(
      (a: ToData, b: ToData) => b.count - a.count
    )
    for (const abusedData of mostAbusedSorted) {
      if (config.verbose) console.log(`Contract address: ${abusedData.to}. Count: ${abusedData.count}`)
      if (config.verbose) console.log(`Most frequent caller addresses:`)
      const sortedCallers: FromData[] = Object.values(abusedData.from).sort(
        (a: FromData, b: FromData) => b.count - a.count
      )
      for (const caller of sortedCallers) {
        if (config.verbose) console.log(`    ${caller.from}, count: ${caller.count}`)
        const sortedIps: IpData[] = Object.values(caller.ips).sort((a: IpData, b: IpData) => b.count - a.count)
        for (const ip of sortedIps) {
          if (config.verbose) console.log(`             ${ip.ip}, count: ${ip.count}`)
        }
        if (this.isTooManyTx(caller.count) && config.rateLimit && config.rateLimitOption.banSpammerAddress) {
          this.addSenderToBacklist(caller.from)
          if (config.verbose)
            console.log(`Caller ${caller.from} is added to spammer list due to sending spam txs to ${abusedData.to}`)
        }
      }
    }

    // ban most abuse sender addresses
    const mostAbusedSendersSorted: { address: string; count: number }[] = Object.values(this.abusedSenders).sort(
      (a: { address: string; count: number }, b: { address: string; count: number }) => b.count - a.count
    )
    for (const spammerInfo of mostAbusedSendersSorted) {
      if (this.isTooManyTx(spammerInfo.count) && config.rateLimit && config.rateLimitOption.banSpammerAddress) {
        this.addSenderToBacklist(spammerInfo.address)
      }
    }
    this.resetCollectors()
  }

  private isTooManyTx(count: number): boolean {
    return count > config.rateLimitOption.allowedTxCountInCheckInterval
  }

  // clear things up for next collection
  resetCollectors(): void {
    this.requestTracker = {}
    this.allRequestTracker = {}
    this.totalTxTracker = {}
    this.heavyRequests = new Map()
    this.heavyAddresses = new Map()
    this.abusedSenders = new Map()
    this.abusedToAddresses = new Map()
  }

  addHeavyRequest(ip: string): void {
    // Skip tracking for whitelisted IPs
    if (this.whiteList.has(ip)) {
      return
    }

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

  addHeavyAddress(address: string): void {
    if (this.heavyAddresses.get(address)) {
      const reqHistory = this.heavyAddresses.get(address)
      if (reqHistory) reqHistory.push(Date.now())
    } else {
      this.heavyAddresses.set(address, [Date.now()])
    }
  }

  addAbusedSender(address: string): void {
    /*eslint-disable security/detect-object-injection */
    const abusedSender = this.abusedSenders.get(address)
    if (abusedSender) {
      abusedSender.count += 1
      this.abusedSenders.set(address, abusedSender)
    } else {
      this.abusedSenders.set(address, { address, count: 1 })
    }
    /*eslint-enable security/detect-object-injection */
  }

  addAbusedAddress(toAddress: string, fromAddress: string, ip: string): void {
    /*eslint-disable security/detect-object-injection */
    let abusedToAddress = this.abusedToAddresses.get(toAddress)
    if (abusedToAddress) {
      abusedToAddress.count += 1
      const fromData = abusedToAddress.from[fromAddress]
      if (fromData) {
        fromData.count += 1
        fromData.from = fromAddress
        if (fromData.ips[ip]) {
          fromData.ips[ip].count += 1
        } else {
          fromData.ips[ip] = { ip, count: 1 }
        }
      } else {
        abusedToAddress.from[fromAddress] = {
          count: 1,
          from: fromAddress,
          ips: {
            ip: {
              count: 1,
              ip,
            },
          },
        }
      }
    } else {
      abusedToAddress = {
        to: toAddress,
        count: 1,
        from: {},
      }

      abusedToAddress.from[fromAddress] = {
        count: 1,
        from: fromAddress,
        ips: {
          ip: {
            count: 1,
            ip,
          },
        },
      }
    }
    this.abusedToAddresses.set(toAddress, abusedToAddress)
    /*eslint-enable security/detect-object-injection */
  }

  addAllRequest(ip: string): void {
    /*eslint-disable security/detect-object-injection */
    if (this.allRequestTracker[ip]) {
      this.allRequestTracker[ip].count += 1
    } else {
      this.allRequestTracker[ip] = { ip, count: 1 }
    }
    /*eslint-enable security/detect-object-injection */
  }

  isIpBanned(ip: string): boolean {
    if (config.rateLimit && config.rateLimitOption.banIpAddress) {
      const bannedIpList = this.bannedIps.map((data) => data.ip)
      if (bannedIpList.indexOf(ip) >= 0) return true
      else return false
    } else {
      return false
    }
  }

  isQueryType(reqType: string): boolean {
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

  async checkFaucetAccount(address: string, allowPlatform: string | null = null): Promise<boolean> {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async isRequestOkay(ip: string, reqType: string, reqParams: any[]): Promise<boolean> {
    if (config.verbose) console.log(`Checking request for ip ${ip}, type ${reqType}, params ${reqParams}`)
    const now = Date.now()
    const oneMinute = 60 * 1000

    if (this.whiteList.has(ip)) {
      if (config.verbose) console.log(`This ip ${ip} is whitelisted.`, reqType, reqParams)
      return true
    }

    if (this.isIpBanned(ip)) {
      if (config.verbose) console.log(`This ip ${ip} is banned.`, reqType, reqParams)
      return false
    }

    if (this.isQueryType(reqType)) {
      if (config.verbose) console.log(`This request is a query type.`, reqType, reqParams)
      return true
    }

    // Don't track heavy requests for whitelisted IPs
    if (!this.whiteList.has(ip)) {
      // record this heavy request before checking
      this.addHeavyRequest(ip)
    }

    const heavyReqHistory = this.heavyRequests.get(ip)

    if (heavyReqHistory && heavyReqHistory.length >= config.rateLimitOption.allowedHeavyRequestPerMin + 1) {
      if (
        now - heavyReqHistory[heavyReqHistory.length - config.rateLimitOption.allowedHeavyRequestPerMin] <
        oneMinute
      ) {
        if (config.verbose)
          console.log(
            `Ban this ip ${ip} due to continuously sending more than ${config.rateLimitOption.allowedHeavyRequestPerMin} reqs in 60s`
          )
        this.addToBlacklist(ip)
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
        if (config.verbose)
          console.log(
            `Your last heavy req is less than 60s ago`,
            `total requests: ${heavyReqHistory.length}, `,
            Math.round((now - heavyReqHistory[heavyReqHistory.length - 10]) / 1000),
            'seconds'
          )
        if (transaction) {
          if (config.verbose) console.log('tx rejected', bufferToHex(transaction.hash()))
        }
        return false
      }
    }

    if (reqType === 'eth_sendRawTransaction') {
      if (config.verbose) console.log(`This request is a sendRawTransaction type.`, reqType, reqParams)
      try {
        const readableTx = {
          from: transaction?.getSenderAddress().toString(),
          to: transaction?.to ? transaction.to.toString() : '',
          value: transaction?.value.toString(),
          data: bufferToHex(transaction?.data as Buffer),
          hash: bufferToHex(transaction?.hash() as Buffer),
        }
        if (readableTx.from) this.addHeavyAddress(readableTx.from)
        if (readableTx.to && readableTx.to !== readableTx.from) this.addHeavyAddress(readableTx.to)

        const fromAddressHistory = this.heavyAddresses.get(readableTx.from as string)

        if (
          config.rateLimit &&
          config.rateLimitOption.limitFromAddress &&
          this.isSenderBlacklisted(readableTx.from as string)
        ) {
          if (config.verbose) console.log(`Sender ${readableTx.from} is blacklisted.`)
          return false
        }

        if (config.rateLimit && config.rateLimitOption.limitFromAddress) {
          if (fromAddressHistory && fromAddressHistory.length >= 10) {
            if (now - fromAddressHistory[fromAddressHistory.length - 10] < oneMinute) {
              if (config.verbose) console.log(`Your address ${readableTx.from} injected 10 txs within 60s`)
              this.addAbusedAddress(readableTx.to, readableTx.from as string, ip)
              this.addAbusedSender((readableTx.from as string).toLowerCase())
              return false
            }
          }
        }

        if (config.rateLimit && config.rateLimitOption.limitToAddress) {
          const toAddressHistory = this.heavyAddresses.get(readableTx.to)
          if (toAddressHistory && toAddressHistory.length >= 10) {
            if (now - toAddressHistory[toAddressHistory.length - 10] < oneMinute) {
              this.addAbusedAddress(readableTx.to, readableTx.from as string, ip)
              if (config.verbose) console.log(`Last tx TO this contract address ${readableTx.to} is less than 60s ago`)

              if (config.rateLimitOption.allowFaucetAccount) {
                const isFaucetAccount = await this.checkFaucetAccount(
                  (readableTx.from as string).toLowerCase(),
                  'discord'
                )
                if (isFaucetAccount) {
                  console.log(`Allow address ${readableTx.from} to an abused contract because it is a faucet account`)
                  return true
                }
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

  cleanUp() {
    this.resetCollectors()
    this.bannedIps = []
    this.blackListedSenders.clear()
    this.whiteList.clear()
    if (this.clearOldIpsInterval) clearInterval(this.clearOldIpsInterval)
    if (this.checkAndBanSpammersInterval) clearInterval(this.checkAndBanSpammersInterval)
  }
}
