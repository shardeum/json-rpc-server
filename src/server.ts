import jayson from 'jayson'
import cors from 'cors'
import express, { NextFunction } from 'express'
import * as http from 'http'
import * as WebSocket from 'ws'
import cookieParser from 'cookie-parser'
import { saveTxStatus, wrappedMethods } from './api'
import { debug_info, setupLogEvents } from './logger'
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
  updateEdgeNodeConfig,
} from './utils'
import { router as logRoute } from './routes/log'
import { healthCheckRouter } from './routes/healthCheck'
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
import { methodWhitelist } from './middlewares/methodWhitelist'
import { isDebugModeMiddlewareLow, rateLimitedDebugAuth } from './middlewares/debugMiddleware'
import { isIPv4 } from 'net'

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
const server = new jayson.Server(wrappedMethods)
let port = config.port //8080
const chainId = config.chainId //8080
const verbose = config.verbose

const extendedServer = http.createServer(app)
extendedServer.on('connection', (socket) => {
  socket.setKeepAlive(true, 60000) // keep the connection to avoid unnecessary handshakes every time
  socket.setTimeout(20000) // close connection after 20s of inactivity
  socket.on('timeout', () => {
    socket.end()
  })
})

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

app.set('trust proxy', false)
app.use(cors({ methods: ['POST'] }))
app.use(express.json())
app.use(cookieParser())
app.use(function (req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), cross-origin-isolated=(), display-capture=(), document-domain=(), encrypted-media=(), execution-while-not-rendered=(), execution-while-out-of-viewport=(), fullscreen=(), geolocation=(), gyroscope=(), keyboard-map=(), magnetometer=(), microphone=(), midi=(), navigation-override=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=(), clipboard-read=(), clipboard-write=(), gamepad=(), speaker-selection=(), conversion-measurement=(), focus-without-user-activation=(), hid=(), idle-detection=(), interest-cohort=(), serial=(), sync-script=(), trust-token-redemption=(), unload=(), window-placement=(), vertical-scroll=()'
  )
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Content-Security-Policy', "default-src 'self'")
  next()
})

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
}

app.get('/api/subscribe', rateLimitedDebugAuth(isDebugModeMiddlewareLow), (req: Request, res: Response) => {
  nestedCountersInstance.countEvent('api', 'subscribe')
  const query = req.query
  if (!query || !query.ip || !query.port) {
    if (verbose) console.log('IP or port not provided')
    return res.status(400).send('IP or port not provided')
  }
  const ip = query.ip.toString().trim()
  const port = parseInt(query.port.toString().trim())

  if (!isIPv4(ip)) {
    if (verbose) console.log('Invalid IP address')
    return res.status(400).send('Invalid IP address')
  }

  if (isNaN(port) || port <= 0 || port > 65535) {
    if (verbose) console.log('Invalid port')
    return res.status(400).send('Invalid port')
  }

  if (changeNode(ip, port)) {
    return res.send(`Successfully changed to ${ip}:${port}`)
  } else {
    return res.send('Invalid ip or port')
  }
})

app.get('/counts', rateLimitedDebugAuth(isDebugModeMiddlewareLow), (req: Request, res: Response) => {
  nestedCountersInstance.countEvent('api', 'counts')
  const arrayReport = nestedCountersInstance.arrayitizeAndSort(nestedCountersInstance.eventCounters)
  if (req.headers.accept === 'application/json') {
    return res.json({
      timestamp: Date.now(),
      report: arrayReport,
    })
  } else {
    // This returns the counts to the caller
    nestedCountersInstance.printArrayReport(arrayReport, res, 0)
    res.write(`Counts at time: ${Date.now()}\n`)
    return res.end()
  }
})

app.get('/counts-reset', rateLimitedDebugAuth(isDebugModeMiddlewareLow), (req: Request, res: Response) => {
  nestedCountersInstance.eventCounters = new Map()
  res.send(`counts reset ${Date.now()}`)
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
  let ip = String(req.socket.remoteAddress)
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

app.use('/', logRoute)
app.use('/', healthCheckRouter)
app.use(injectIP)
// Method Whitelisting Middleware
app.use(methodWhitelist)
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
    updateEdgeNodeConfig()
    setInterval(updateNodeList, config.nodelistRefreshInterval)
    setInterval(saveTxStatus, 5000)
    setInterval(checkArchiverHealth, 60000)
    setInterval(cleanBadNodes, 60000)
    setInterval(updateEdgeNodeConfig, 60000 * 5)
    extendedServer.listen(port, function () {
      console.log(`JSON RPC Server listening on port ${port} and chainId is ${chainId}.`)
      setupDatabase()
      setupLogEvents()
      setupSubscriptionEventHandlers()
      setupEvmLogProviderConnectionStream()
    })
  })
})
