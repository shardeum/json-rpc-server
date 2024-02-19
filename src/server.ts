import jayson from 'jayson'
import cors from 'cors'
import express, { NextFunction } from 'express'
import * as http from 'http'
import * as WebSocket from 'ws'
import cookieParser from 'cookie-parser'
import { methods, saveTxStatus } from './api'
import { debug_info, setupLogEvents } from './logger'
import authorize from './middlewares/authorize'
import injectIP from './middlewares/injectIP'
import { setupDatabase } from './storage/sqliteStorage'
import {
  changeNode,
  setConsensorNode,
  updateNodeList,
  RequestersList,
  checkArchiverHealth,
  sleep,
  cleanBadNodes,
  initSyncTime,
} from './utils'
import { router as logRoute } from './routes/log'
import { router as authenticate } from './routes/authenticate'
import { Request, Response } from 'express'
import { CONFIG, CONFIG as config } from './config'
import blackList from '../blacklist.json'
import spammerList from '../spammerlist.json'
import path from 'path'
import { onConnection, setupSubscriptionEventHandlers } from './websocket'
import rejectSubscription from './middlewares/rejectSubscription'
import { setupEvmLogProviderConnectionStream } from './websocket/log_server'
import { setupArchiverDiscovery } from '@shardus/archiver-discovery'
import { setDefaultResultOrder } from 'dns'
import { nestedCountersInstance } from './utils/nestedCounters'
setDefaultResultOrder('ipv4first')

// const path = require('path');
// var whitelist = ['http://example1.com', 'http://example2.com']
// var corsOptions = {
//   origin: function (origin, callback) {
//     if (whitelist.indexOf(origin) !== -1) {
//       callback(null, true)
//     } else {
//       callback(new Error('Not allowed by CORS'))
//     }
//   }
// }
const app = express()
const server = new jayson.Server(methods)
let port = config.port //8080
const chainId = config.chainId //8080

const extendedServer = http.createServer(app)

const wss = new WebSocket.Server({ server: extendedServer })

if (CONFIG.websocket.enabled) {
  wss.on('connection', onConnection)
}

const myArgs = process.argv.slice(2)
if (myArgs.length > 0) {
  port = parseInt(myArgs[0])
  config.port = port
  console.log(`json-rpc-server port console override to:${port}`)
}

export const ipport = CONFIG.ip + '__' + CONFIG.port
//maybe catch unhandled exceptions?
process.on('uncaughtException', (err) => {
  console.log('uncaughtException:' + err)
})
process.on('unhandledRejection', (err) => {
  console.log('unhandledRejection:' + err)
})

app.set('trust proxy', true)
app.use(cors({ methods: ['POST'] }))
app.use(express.json())
app.use(cookieParser())

if (config.dashboard.enabled && config.dashboard.dist_path) {
  const clientDirectory =
    config.dashboard.dist_path[0] === '/'
      ? config.dashboard.dist_path
      : path.resolve(config.dashboard.dist_path)
  const staticDirectory = path.join(clientDirectory, 'static')
  console.log(path.join(clientDirectory, 'index.html'))
  app.set('views', clientDirectory)
  app.use('/static', express.static(staticDirectory))
  // app.set('views', clientDirectory);
  app.get('/dashboard', function (req, res) {
    return res.sendFile(path.join(clientDirectory, 'index.html'))
  })
}

app.get('/api/subscribe', authorize, (req: Request, res: Response) => {
  nestedCountersInstance.countEvent('api', 'subscribe')
  const query = req.query
  if (!query || !req.ip || !query.port) {
    console.log('Invalid ip or port')
    return res.end('Invalid ip or port')
  }
  const ip = req.ip || '127.0.0.1'
  const port = req.connection.localPort || 9001
  const success = changeNode(ip, port, true)
  if (!success) {
    res.end(`Ip not in the nodelist ${ip}:${port}, node subscription rejected`)
    return
  }
  res.end(`Successfully changed to ${ip}:${port}`)
})

app.get('/api/health', (req: Request, res: Response) => {
  nestedCountersInstance.countEvent('api', 'health')
  return res.json({ healthy: true }).status(200)
})

app.get('/counts', authorize, (req: Request, res: Response) => {
  nestedCountersInstance.countEvent('api', 'counts')
  const arrayReport = nestedCountersInstance.arrayitizeAndSort(nestedCountersInstance.eventCounters)
  if (req.headers.accept === 'application/json') {
    res.setHeader('Content-Type', 'application/json')
    res.json({
      timestamp: Date.now(),
      report: arrayReport,
    })
    res.end()
  } else {
    // This returns the counts to the caller
    nestedCountersInstance.printArrayReport(arrayReport, res, 0)
    res.write(`Counts at time: ${Date.now()}\n`)
    res.end()
  }
})

app.get('/counts-reset', authorize, (req: Request, res: Response) => {
  nestedCountersInstance.eventCounters = new Map()
  res.write(`counts reset ${Date.now()}`)
  res.end()
})

const requestersList = new RequestersList(blackList, spammerList)

interface CustomError extends Error {
  status?: number
  statusCode?: number | undefined
}

app.use((err: CustomError, req: Request, res: Response, next: NextFunction) => {
  nestedCountersInstance.countEvent('api-error', 'error')
  if (err.status === 400 || err.status === 401 || err.status === 403 || err.status === 404) {
    const formattedError = {
      // TODO: (Bui) ask if statusCode was intentional or should it be status?
      status: err.statusCode,
      message: err.message,
    }
    return res.status(err.statusCode || 500).json(formattedError) // Bad request
  }
  next()
})

app.use(async (req: Request, res: Response, next: NextFunction) => {
  if (!config.rateLimit) {
    next()
    return
  }
  let ip = req.ip
  if (ip.substring(0, 7) == '::ffff:') {
    ip = ip.substring(7)
  }
  //console.log('IP is ', ip)

  const reqParams = req.body.params
  const isRequestOkay = await requestersList.isRequestOkay(ip, req.body.method, reqParams)
  if (!isRequestOkay) {
    if (config.rateLimitOption.softReject) {
      const randomSleepTime = 10 + Math.floor(Math.random() * 10)
      await sleep(randomSleepTime * 1000)
      res.status(503).send('Network is currently busy. Please try again later.')
      return
    } else {
      res.status(503).send('Rejected by rate-limiting')
      return
    }
  }
  next()
})

app.use('/log', authorize, logRoute)
app.use('/authenticate', authenticate)
app.use(injectIP)
// reject subscription methods from http
app.use(rejectSubscription)
app.use(server.middleware())

setupArchiverDiscovery({
  customConfigPath: 'archiverConfig.json',
}).then(() => {
  console.log('Finished setting up archiver discovery!')
  updateNodeList(true).then(() => {
    debug_info.interfaceRecordingStartTime = config.statLog ? Date.now() : 0
    debug_info.txRecordingStartTime = config.recordTxStatus ? Date.now() : 0
    setConsensorNode()
    initSyncTime()
    setInterval(updateNodeList, config.nodelistRefreshInterval)
    setInterval(saveTxStatus, 5000)
    setInterval(checkArchiverHealth, 60000)
    setInterval(cleanBadNodes, 60000)
    extendedServer.listen(port, function () {
      console.log(`JSON RPC Server listening on port ${port} and chainId is ${chainId}.`)
      setupDatabase()
      setupLogEvents()
      setupSubscriptionEventHandlers()
      setupEvmLogProviderConnectionStream()
    })
  })
})
