const jayson = require('jayson');
const url = require('url')
const cors = require('cors');
const connect = require('connect');
const jsonParser = require('body-parser').json;
const express = require('express')
import { ObjectFlags } from 'typescript';
import {methods} from './api'
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
  allRequests: Map<string, number[]>
  bannedIps: string[]
  requestTracker: any
  allRequestTracker: any
  totalTxTracker: any
  constructor(blackList: string[]) {
    this.heavyRequests = new Map()
    this.allRequests = new Map()
    this.requestTracker = {}
    this.allRequestTracker = {}
    this.totalTxTracker = {}
    this.bannedIps = blackList
    let self = this
    setInterval(() => {
      self.clearOldIps()
    }, 60 * 1000)
    setInterval(() => {
      self.logMostFrequentIps()
    }, 5 * 60 * 1000)
  }

  clearOldIps() {
    const now = Date.now()
    const oneMinute = 60 * 1000
    for (let [ip, reqHistory] of this.heavyRequests) {
      let numOfRecordsToRemove = 0
      for (let i=0; i < reqHistory.length; i++) {
        if (now - reqHistory[i] < oneMinute) break // we can stop looping the record array here
        else if (now - reqHistory[i] > oneMinute) numOfRecordsToRemove++
      }
      reqHistory.splice(0, numOfRecordsToRemove) // oldest item is at index 0
      console.log('reqHistory after clearing heavy request history', reqHistory)
    }
    for (let [ip, reqHistory] of this.allRequests) {
      let numOfRecordsToRemove = 0
      for (let i=0; i < reqHistory.length; i++) {
        if (now - reqHistory[i] < oneMinute) break // we can stop looping the record array here
        else if (now - reqHistory[i] > oneMinute) numOfRecordsToRemove++
      }
      reqHistory.splice(0, numOfRecordsToRemove) // oldest item is at index 0
      console.log('reqHistory after clearing all request history', reqHistory)
    }
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
    if(this.allRequests.get(ip)) {
      let reqHistory = this.allRequests.get(ip)
      if(reqHistory) reqHistory.push(Date.now())
    } else {
      this.allRequests.set(ip, [Date.now()])
    }
  }
  isIpBanned(ip: string) {
    if (this.bannedIps.indexOf(ip) >= 0) return true
    else return false
  }
  isExceedRateLimit(ip: string): boolean {
    const now = Date.now()
    const oneMinute = 60 * 1000

    let heavyReqHistory = this.heavyRequests.get(ip)
    let allReqHistory = this.allRequests.get(ip)

    if (!heavyReqHistory || !allReqHistory) {
      return false
    }

    if (heavyReqHistory && heavyReqHistory.length >= 10) {
      if (now - heavyReqHistory[heavyReqHistory.length - 10] < oneMinute) {
        if(true) console.log(`Your last heavy req is less than 60s ago`, heavyReqHistory.length, Math.round((now - heavyReqHistory[heavyReqHistory.length - 10]) / 1000), 'seconds')
        return true
      }
    }

    if (allReqHistory && allReqHistory.length >= 30) {
      if (now - allReqHistory[allReqHistory.length - 30] < oneMinute) {
        if (true) console.log(`Your last all req is less than 60s ago`, allReqHistory.length, Math.round((now - allReqHistory[allReqHistory.length - 30]) / 1000), 'seconds')
        return true
      }
    }

    if (true) console.log(`We allow ip ${ip} because num of req in history is less than 10 or last request is older than 60s`, heavyReqHistory.length)
    return false
  }
}

const requestersList = new RequestersList(blackList.ips)

app.use((req: any, res: any, next: Function) => {
  // if we move the bound of the if-scope wrapping the whole middleware, we could potentially have better performance
  if (!config.rateLimit) {
    next()
    return
  }
  let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
  if (ip.substr(0, 7) == '::ffff:') {
    ip = ip.substr(7)
  }
  if (requestersList.isIpBanned(ip)) {
    res.status(503).send('Too many requests from this IP')
    console.log(`This ip ${ip} is banned.`)
    return
  }

  requestersList.addAllRequest(ip)

  if (req.body.method === 'eth_getBalance' || req.body.method === 'eth_call' || req.body.method === 'eth_blockNumber') {
    next()
    return
  }

  // rate limit for all other requests
  if (requestersList.isExceedRateLimit(ip)) {
    res.status(503).send('Too many requests from this IP, try again in 60 seconds.')
    // console.log(`Too many requests from this IP ${ip}, try again in 60 seconds.`)
    return
  }
  if (req.body.method !== 'eth_getBalance' && req.body.method !== 'eth_call' && req.body.method !== 'eth_blockNumber') {
    requestersList.addHeavyRequest(ip)
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
