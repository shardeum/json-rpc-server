const jayson = require('jayson');

const url = require('url')
const cors = require('cors');
const connect = require('connect');
const express = require('express')
const cookieParser = require('cookie-parser');
import {methods, verbose, recordTxStatus, forwardTxStatusToExplorer} from './api'
import {apiPerfLogData, apiPefLogger, setupLogEvents} from './logger';
import authorize from './middlewares/authorize';
import injectIP from './middlewares/injectIP';
import { setupDatabase } from './storage/sqliteStorage';
import {changeNode, setConsensorNode, getTransactionObj, updateNodeList, RequestersList} from './utils'
const logRoute = require('./routes/log')
const authenticate = require('./routes/authenticate')

const config = require("./config")

const blackList = require("./blacklist.json")

const app = express()
const server = new jayson.Server(methods);
let port = config.port //8080
let chainId = config.chainId //8080

const myArgs = process.argv.slice(2)
if (myArgs.length > 0) {
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
app.use(express.json());
app.use(cookieParser());

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

const requestersList = new RequestersList(blackList)

app.use((req: any, res: any, next: Function) => {
  if (!config.rateLimit) {
    next()
    return
  }
  let ip = req.ip
  if (ip.substr(0, 7) == '::ffff:') {
    ip = ip.substr(7)
  }
  //console.log('IP is ', ip)

  let reqParams = req.body.params
  if (!requestersList.isRequestOkay(ip, req.body.method, reqParams)) {
    res.status(503).send('Too many requests from this IP, try again in 60 seconds.')
    return
  }
  next()
})

if (config.statLog) {
  // profile performance every 30min
  setInterval(() => {
    apiPefLogger()
  }, 60000 * config.statLogStdoutInterval);
}

app.use('/log',authorize, logRoute);
app.use('/authenticate',authenticate);
app.use(injectIP);
app.use(server.middleware());

updateNodeList(true).then(success => {
  setConsensorNode()
  setInterval(updateNodeList, 10000)
  setInterval(forwardTxStatusToExplorer, 10000)
  app.listen(port, (err: any) => {
    if (err) console.log('Unable to start JSON RPC Server', err)
    console.log(`JSON RPC Server listening on port ${port} and chainId is ${chainId}.`)
    setupDatabase()
    setupLogEvents()
  });
})
