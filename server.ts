const jayson = require('jayson');
const url = require('url')
const cors = require('cors');
const connect = require('connect');
const jsonParser = require('body-parser').json;
const express = require('express')
import {methods} from './api'
import {apiPefLogger, apiStatCollector, changeNode, setConsensorNode, updateNodeList} from './utils'
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


setInterval(()=>{ apiPefLogger(60) }, 60000);

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

// express middleware which records every single request coming in for what endpoint it request
app.use((req: any,res: any,next: Function) => { 
    apiStatCollector(req.body.method, req.body.params);
    next();
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
