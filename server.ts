const jayson = require('jayson');
const fs = require('fs')
const url = require('url')
const cors = require('cors');
const connect = require('connect');
const jsonParser = require('body-parser').json;
const express = require('express')
import { ObjectFlags } from 'typescript';
import {methods, verbose} from './api'
import { logData, logTicket, logEventEmitter, apiPefLogger } from './logger';
import {changeNode, setConsensorNode, updateNodeList} from './utils'
const config = require("./config.json")
const blackList = require("./blacklist.json")

const app = express()
const server = new jayson.Server(methods);
let port = config.port //8080
let chainId = config.chainId //8080

const myArgs = process.argv.slice(2)
if(myArgs.length > 0) {
  port = myArgs[0]
  config.port = port
  console.log(`json-rpc-server port console override to:${port}`)
}


//maybe catch unhandled exceptions?
process.on('uncaughtException', (err) => {
    console.log('uncaughtException:' + err)
})
process.on('unhandledRejection', (err) => {
    console.log('unhandledRejection:' + err)
})

app.set("trust proxy", true);
app.use(cors({methods: ['POST']}));
app.use(jsonParser());
app.get('/api/subscribe', (req: any, res: any) => {
  const query = req.query
  if (!query || !query.ip || !query.port) {
    console.log('Invalid ip or port')
    return res.end('Invalid ip or port')
  }
  const ip = query.ip || 'localhost'
  const port = parseInt(query.port) || 9001
  changeNode(ip, port)
  res.end(`Successfully changed to ${ip}:${port}`)
})

app.get('/api-stats', (req: any, res: any) => {
  try{
    for ( const [key,value] of Object.entries(logData)){
      logData[key].tAvg = value.tTotal / value.count
    }
    return res.json(logData).status(200)
  }catch(e){
    return res.json({error: "Internal Server Error"}).status(500)
  }
})

// this api is as of now public
// meaning everyone can reset this
// not a very good idea
// app.get('/reset-timers', (req: any, res: any) => {
//   try{
//     for ( const [key,] of Object.entries(logData)){
//       delete logData[key]
//     }
//     return res.json({status: 'ok'}).status(200)
//   }catch(e){
//     return res.json({error: "Internal Server Error"}).status(500)
//   }
// })


// express middleware that limits requests to 1 every 10 sec per IP, unless its a eth_getBalance request
class RequestersList {
  heavyRequests: Map<string, number[]>
  bannedIps: any[]
  requestTracker: any
  allRequestTracker: any
  totalTxTracker: any
  constructor(blackList: string[] = []) {
    this.heavyRequests = new Map()
    this.requestTracker = {}
    this.allRequestTracker = {}
    this.totalTxTracker = {}
    this.bannedIps = blackList.map((ip: string) => {
      return {ip, timestamp: Date.now()}
    })
    let self = this
    setInterval(() => {
      self.clearOldIps()
    }, 60 * 1000)
    setInterval(() => {
      self.logMostFrequentIps()
    }, 5 * 60 * 1000)
  }
  addToBlacklist(ip: string) {
    this.bannedIps.push({ip, timestamp: Date.now()})
    fs.writeFile('blacklist.json', JSON.stringify(this.bannedIps.map(data => data.ip)), (err: any) => {
      console.log(`Added ip ${ip} to banned list`)
    })
  }

  clearOldIps() {
    const now = Date.now()
    const oneMinute = 60 * 1000
    for (let [ip, reqHistory] of this.heavyRequests) {
      let i = 0
      for (; i < reqHistory.length; i++) {
        if (now - reqHistory[i] < oneMinute) break // we can stop looping the record array here
      }
      if (i > 0) reqHistory.splice(0, i - 1) // oldest item is at index 0
      console.log('reqHistory after clearing heavy request history', reqHistory.length)
    }

    // unban the ip after 1 hour
    this.bannedIps = this.bannedIps.filter((record: any) => {
      if (now - record.timestamp >= 60 * 60 * 1000) return false
      else return true
    })
  }
  logMostFrequentIps() {
    // log and clean successful requests
    let records = Object.values(this.requestTracker)
    records = records.sort((a: any, b: any) => b.count - a.count)
    if (config.verbose) console.log('Most frequent successful IPs:', records)
    this.requestTracker = {}

    // log and clean all requests
    let allRecords = Object.values(this.allRequestTracker)
    allRecords = allRecords.sort((a: any, b: any) => b.count - a.count)
    if (config.verbose) console.log('Most frequent all IPs (rejected + successful):', allRecords)
    this.allRequestTracker = {}

    // log total injected tx by ip
    let txRecords = Object.values(this.totalTxTracker)
    txRecords = txRecords.sort((a: any, b: any) => b.count - a.count)
    console.log('Total num of txs injected by IPs', txRecords)
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
    if(this.heavyRequests.get(ip)) {
      let reqHistory = this.heavyRequests.get(ip)
      if(reqHistory) reqHistory.push(Date.now())
    } else {
      this.heavyRequests.set(ip, [Date.now()])
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
    let bannedIpList = this.bannedIps.map(data => data.ip)
    if (bannedIpList.indexOf(ip) >= 0) return true
    else return false
  }
  isQueryType(reqType: string, reqParams: any[]) {
    try {
      let queryTypes = ['eth_getBalance', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_gasPrice', 'eth_feeHistory', 'eth_getTransactionCount', 'eth_getCode', 'eth_estimateGas']
      if (queryTypes.indexOf(reqType) >= 0) return true
      if (reqType === 'eth_call' && reqParams[0].data.indexOf('0x70a08231') >= 0) {
        if(config.verbose) console.log('ERC20 balance query detected. Request okay')
        return true
      }
      return false
    } catch (e) {
      return false
    }
  }
  isRequestOkay(ip: string, reqType: string, reqParams: any[] ): boolean {
    const now = Date.now()
    const oneMinute = 60 * 1000

    if (this.isIpBanned(ip)) {
      console.log(`This ip ${ip} is banned.`)
      return false
    }

    if (this.isQueryType(reqType, reqParams)) {
      return true
    }

    let heavyReqHistory = this.heavyRequests.get(ip)

    // no heavy requests for this ip yet, allow this request
    if (!heavyReqHistory) {
      if (!this.isQueryType(reqType, reqParams)) {
        this.addHeavyRequest(ip)
      }
      return true
    }

    if (heavyReqHistory && heavyReqHistory.length >= 61) {
      if (now - heavyReqHistory[heavyReqHistory.length - 61] < oneMinute) {
        if (true) console.log(`Ban this ip`)
        this.addToBlacklist(ip)
        return false
      }
    }

    if (heavyReqHistory && heavyReqHistory.length >= 10) {
      if (now - heavyReqHistory[heavyReqHistory.length - 10] < oneMinute) {
        if(true) console.log(`Your last heavy req is less than 60s ago`, heavyReqHistory.length, Math.round((now - heavyReqHistory[heavyReqHistory.length - 10]) / 1000), 'seconds')
        return false
      }
    }

    if (true) console.log(`We allow ip ${ip} because num of req in history is less than 10 or last request is older than 60s`, heavyReqHistory.length)
    if (!this.isQueryType(reqType, reqParams)) {
      this.addHeavyRequest(ip)
    }
    return true
  }
}

const requestersList = new RequestersList(blackList)

app.use((req: any, res: any, next: Function) => {
  if (!config.rateLimit) {
    next()
    return
  }
  let ip = req.socket.remoteAddress
  if (ip.substr(0, 7) == '::ffff:') {
    ip = ip.substr(7)
  }

  let reqParams = req.body.params
  if (!requestersList.isRequestOkay(ip, req.body.method, reqParams)) {
    res.status(503).send('Too many requests from this IP, try again in 60 seconds.')
    return
  }
  next()
})

if (config.statLog){
  // profile performance every 30min
  setInterval(()=>{ apiPefLogger() }, 60000 * config.statLogStdoutInterval);
}

logEventEmitter.on('fn_start', (ticket: string, api_name: string, start_timer: number) => {

  logTicket[ticket] = {
    api_name: api_name,
    start_timer: start_timer
  }
})

logEventEmitter.on('fn_end', (ticket: string, end_timer: number) => {

  if(!logTicket.hasOwnProperty(ticket)) return

  const { api_name, start_timer } = logTicket[ticket]
  // tfinal is the time it took to complete an api
  const tfinal = end_timer - start_timer;
  if(logData.hasOwnProperty(api_name)){

    logData[api_name].count += 1
    logData[api_name].tTotal += tfinal

    const tMin = logData[api_name].tMin
    const tMax = logData[api_name].tMax

    logData[api_name].tMin = (tfinal < tMin) ? tfinal : tMin
    logData[api_name].tMax = (tfinal > tMax) ? tfinal : tMax

  }
  if(!logData.hasOwnProperty(api_name)){
    logData[api_name] = {
      count: 1,
      tMin: tfinal,
      tMax: tfinal,
      tTotal: tfinal,
    }
  }
  delete logTicket[ticket]
})

app.use(server.middleware());
updateNodeList().then(success => {
    setConsensorNode()
    setInterval(updateNodeList, 10000)
    app.listen(port, (err: any) => {
        if (err) console.log('Unable to start JSON RPC Server', err)
        console.log(`JSON RPC Server listening on port ${port} and chainId is ${chainId}.`)
    });
})
