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

const app = express()
const server = new jayson.Server(methods);
let port = config.port //8080
let chainId = config.chainId //8080

const myArgs = process.argv.slice(2)
if(myArgs.length > 0){
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

// profile performance every 30min
setInterval(()=>{ apiPefLogger() }, 60000 * 30);

// express middleware that limits requests to 1 every 10 sec per IP, unless its a eth_getBalance request
class RequestersList {
  ips: Map<string, number>
  constructor() {
    this.ips = new Map()
    let self = this
    setInterval(() => {
      self.clearOldIps() 
    }, 5 * 60 * 1000)
  }

  clearOldIps() {
    console.log('Clearing old ips map')
    this.ips = new Map()
  }

  madeReqInLast10Sec(ip: string): boolean {
    const now = Date.now()

    let lastReqTime = this.ips.get(ip)

    if (!lastReqTime) {
      this.ips.set(ip, now)
      return false
    }

    if (now - lastReqTime <= 10000) {
      return true
    } else {
      this.ips.set(ip, now)
      return false
    }
  }
}

const requestersList = new RequestersList()

app.use((req: any, res: any, next: Function) => {
  // Let eth_getBalance reqs pass
  if (req.body.method !== 'eth_sendRawTransaction' && req.body.method !== 'eth_sendTransaction') {
    next()
    return
  }
  // Stop the request if this IP has made one in the last 10 sec
  if (requestersList.madeReqInLast10Sec(req.ip)) {
    res.status(503).send('Too many requests from this IP, try again in 10 seconds.')
    console.log('Too many requests from this IP, try again in 10 seconds.', req.ip)
    // // Alternatively sending an empty response might result in less client errors
    // // res.send()
    return
  }
  next()
})

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
