import WebSocket from 'ws'
import EventEmitter from 'events'
import { wrappedMethods } from '../api'
import { blockSubscriptionList, logSubscriptionList } from './clients'
import * as crypto from 'crypto'
import { CONFIG } from '../config'
import { evmLogProvider_ConnectionStream } from './log_server'
import {
  newHeadSubscriptionProvider_ConnectionStream,
  setupNewHeadSubscriptionProviderConnectionStream,
  sendNewHeadsMessage,
} from './newhead_server'
import { SubscriptionDetails } from './clients'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { IncomingMessage } from 'http'
import { checkRequest, requestersList } from '../middlewares/rateLimit'

interface Params {
  address?: string | string[]
  topics?: (string | undefined)[]
  [key: number]: string | string[] | Params | WebSocket.WebSocket
}

interface Request {
  jsonrpc: string
  id: number
  method: string
  params: Params
}

// Add connection counter
let activeConnections = 0

const socketActivityMap = new Map<WebSocket.WebSocket, number>()

// Single interval for all connections
setInterval(() => {
  const now = Date.now()
  socketActivityMap.forEach((lastActivity, socket) => {
    if (now - lastActivity > CONFIG.websocket.inactivityTimeoutMs) {
      socket.close(1011, 'Connection inactive for too long')
      socketActivityMap.delete(socket)
    }
  })
}, CONFIG.websocket.inactivityCheckIntervalMs)
const connectionsByIP = new Map<string, Set<WebSocket.WebSocket>>()

const getClientIP = (req: IncomingMessage): string | undefined => {
  if (CONFIG.trustProxy) {
    // Standard X-Forwarded-For header
    const forwardedFor = req.headers['x-forwarded-for']
    if (typeof forwardedFor === 'string') {
      // Take the first IP in the list (leftmost IP)
      return forwardedFor.split(',')[0].trim()
    }
  }

  // Fallback to socket's remote address
  return req.socket.remoteAddress
}

export const onConnection = async (socket: WebSocket.WebSocket, req: IncomingMessage): Promise<void> => {
  const ip = getClientIP(req)
  if (!ip) {
    socket.close(
      1008,
      'Connection closed: Unable to determine your IP address. Please check your network settings and try again.'
    )
    return
  }
  if (requestersList.isIpBanned(ip)) {
    socket.close(1008, 'Connection closed: IP banned from opening new connections.')
    return
  }

  const currentIPConnections = connectionsByIP.get(ip) || new Set()

  // Check max connections per IP limit
  if (currentIPConnections.size >= CONFIG.websocket.maxConnectionsPerIP) {
    socket.close(
      1008,
      `Connection closed: Your IP address has reached the maximum allowed connections. Please close an existing connection or try again later.`
    )
    return
  }
  // Check max connections limit
  if (activeConnections >= CONFIG.websocket.maxConnections) {
    socket.close(1003, 'Server busy. Please try again later.')
    return
  }
  activeConnections++

  // Track last activity time
  socketActivityMap.set(socket, Date.now())
  currentIPConnections.add(socket)
  connectionsByIP.set(ip, currentIPConnections)

  // Set connection timeout
  const timeoutId = setTimeout(() => {
    socket.close(1011, 'Connection timeout reached')
  }, CONFIG.websocket.connectionTimeoutMs)

  const eth_methods = Object.freeze(wrappedMethods)

  socket.on('message', async (message: string) => {
    if (CONFIG.rateLimit) {
      let request
      try {
        request = JSON.parse(message)
      } catch (e) {
        try {
          socket.send('Invalid message format')
        } catch (error) {
          console.error('Failed to send message on WebSocket:', error)
        }
        return
      }

      try {
        const isRequestOkay = await checkRequest(ip, request)

        if (!isRequestOkay) {
          socket.close(
            1008,
            JSON.stringify({ jsonrpc: '2.0', error: { code: -1, message: 'Rate limit exceeded' } })
          )
          return
        }
      } catch (error) {
        console.error('Rate limiting error:', error)
        socket.close(1008, 'Internal server error')
        return
      }
    }

    // Update last activity time on message received
    socketActivityMap.set(socket, Date.now())

    if (CONFIG.verbose) console.log(`Received message: ${message}`)
    nestedCountersInstance.countEvent('websocket', 'message-received')
    let request: Request = {
      jsonrpc: '',
      id: 0,
      method: '',
      params: [],
    }

    try {
      request = JSON.parse(message)
      if (CONFIG.verbose) console.log(request.params)
    } catch (e: unknown) {
      nestedCountersInstance.countEvent('websocket', 'message-received-error')
      if (e instanceof Error) {
        console.log("Couldn't parse websocket message", e.message)
      } else {
        console.log("Couldn't parse websocket message", e)
      }
      socket.close()
    }

    if (request.jsonrpc !== '2.0') socket.close(1002, 'Invalid rpc socket frame')
    if (request.id == null) {
      socket.close(1002, 'Invalid rpc socket frame')
    }
    if (!request.method) socket.send('Method is not specified')
    if (!request.params) socket.send('Params not found')

    const callback = async (err: unknown, result: unknown): Promise<void> => {
      if (err) {
        const err_res_obj = {
          id: request.id,
          jsonrpc: '2.0',
          error: {
            message: err,
            code: -1,
          },
        }
        try {
          socket.send(JSON.stringify(err_res_obj))
        } catch (error) {
          console.error('Failed to send message on WebSocket:', error)
        }
        return
      }
      const res_obj = {
        id: request.id,
        jsonrpc: '2.0',
        result: result,
      }
      try {
        socket.send(JSON.stringify(res_obj))
      } catch (error) {
        console.error('Failed to send message on WebSocket:', error)
      }
      return
    }

    const method_name = request.method as string
    if (!eth_methods[method_name as keyof typeof eth_methods]) {
      socket.send(
        JSON.stringify({
          id: request.id,
          jsonrpc: '2.0',
          error: {
            message: 'Method does not exist',
            code: -1,
          },
        })
      )
      return
    }
    if (method_name === 'eth_subscribe') {
      if (!CONFIG.websocket.enabled || !CONFIG.websocket.serveSubscriptions) {
        socket.send(JSON.stringify(constructRPCErrorRes('Subscription serving disabled', -1, request.id)))
        return
      }

      // Check subscription limit per socket
      const currentSubscriptions = logSubscriptionList.getBySocket(socket)?.size || 0
      if (currentSubscriptions >= CONFIG.websocket.maxSubscriptionsPerSocket) {
        socket.send(
          JSON.stringify(constructRPCErrorRes('Maximum subscriptions per connection reached', -1, request.id))
        )
        return
      }

      try {
        nestedCountersInstance.countEvent('websocket', 'eth_subscribe')
        let subscription_id = crypto.randomBytes(32).toString('hex')
        subscription_id = '0x' + crypto.createHash('sha256').update(subscription_id).digest().toString('hex')
        subscription_id = subscription_id.substring(0, 46)
        request.params[10] = subscription_id

        if (request.params[0] === 'newHeads') {
          blockSubscriptionList.set(subscription_id, { socket: socket, rpc_request_id: request.id })
          // Emit event to establish connection with log server for newHeads
          subscriptionEventEmitter.emit('evm_newHead_subscribe', {
            subscription_id,
            ipport: `${ip}:${CONFIG.port}`,
          })
          // Send success response for newHeads subscription
          callback(null, subscription_id)
          return
        }

        if (
          request.params[0] === 'logs' &&
          typeof request.params[1] === 'object' &&
          ('address' in request.params[1] || 'topics' in request.params[1])
        ) {
          const address = request.params[1].address
          const topics = request.params[1].topics

          // this convert everything to lower case, making it case-insenstive
          if (typeof address === 'string') {
            request.params[1].address = [address.toLowerCase()]
          }
          if (Array.isArray(address)) {
            const uniqueCA = new Set<string>()
            address.map((el) => {
              uniqueCA.add(el.toLowerCase())
            })
            request.params[1].address = Array.from(uniqueCA)
          }
          if (!Array.isArray(topics)) {
            request.params[1].topics = []
          }
          if (request.params[1].topics) {
            request.params[1].topics = request.params[1].topics.map((topic: string | undefined) => {
              return topic?.toLowerCase()
            })
          }
          const subscriptionDetails: SubscriptionDetails = {
            address: request.params[1].address as string[],
            topics: request.params[1].topics as string[],
          }

          logSubscriptionList.set(subscription_id, socket, subscriptionDetails, request.id)
        }
      } catch (e: unknown) {
        nestedCountersInstance.countEvent('websocket', 'eth_subscribe-error')
        if (e instanceof Error) {
          socket.send(
            JSON.stringify({
              id: request.id,
              jsonrpc: '2.0',
              error: {
                message: e.message,
                code: -1,
              },
            })
          )
        }
        return
      }
    } else if (method_name === 'eth_unsubscribe') {
      nestedCountersInstance.countEvent('websocket', 'eth_unsubscribe')
      if (!CONFIG.websocket.enabled || !CONFIG.websocket.serveSubscriptions) {
        socket.send(JSON.stringify(constructRPCErrorRes('Subscription serving disabled', -1, request.id)))
        return
      }
      request.params[10] = socket
    }

    // call interface handler
    eth_methods[method_name as keyof typeof eth_methods](request.params, callback)
  })

  socket.on('close', (code, reason) => {
    // Clean up
    socketActivityMap.delete(socket)
    clearTimeout(timeoutId)

    // Decrement connection counter
    activeConnections--

    const currentIPConnections = connectionsByIP.get(ip)
    if (currentIPConnections) {
      currentIPConnections.delete(socket)
      if (currentIPConnections.size === 0) {
        connectionsByIP.delete(ip)
      }
    }
    console.log(`WebSocket connection closed with code: ${code} and reason: ${reason}`)
    nestedCountersInstance.countEvent('websocket', 'close')

    // Handle log subscriptions cleanup
    if (logSubscriptionList.getBySocket(socket)) {
      logSubscriptionList.getBySocket(socket)?.forEach((subscription_id) => {
        subscriptionEventEmitter.emit('evm_log_unsubscribe', subscription_id)
      })
      logSubscriptionList.removeBySocket(socket)
    }

    // Handle newHeads subscriptions cleanup
    for (const [subscription_id, value] of blockSubscriptionList) {
      if (value.socket === socket) {
        subscriptionEventEmitter.emit('evm_newHead_unsubscribe', subscription_id)
        blockSubscriptionList.delete(subscription_id)
      }
    }

    socket.close(code, reason)
    if (CONFIG.verbose)
      console.log('Current WebSocket subscriptions after connection close:', logSubscriptionList.getAll())
  })
}

export const subscriptionEventEmitter = new EventEmitter()

export const setupSubscriptionEventHandlers = (ipport: string): void => {
  subscriptionEventEmitter.on('evm_log_received', async (logs, subscription_id) => {
    if (!logSubscriptionList.getById(subscription_id)) {
      // this subscription id belong to other rpc
      // doing nothing in this case
      return
    }
    const socket = logSubscriptionList.getById(subscription_id)?.socket

    // we found the log for subscription
    // but the client went disconnected
    // purging subscription
    if (socket?.readyState === 2 || socket?.readyState === 3) {
      evmLogProvider_ConnectionStream?.send(
        JSON.stringify({
          method: 'unsubscribe',
          params: {
            subscription_id,
            ipport,
          },
        })
      )
      // if(res.data.success){
      //   logSubscriptionList.removeBySocket(socket)
      // }
      return
    }

    for (const log of logs) {
      // figured out where this can be done correctly
      log.removed = false

      logSubscriptionList.getById(subscription_id)?.socket.send(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_subscription',
          params: {
            subscription: subscription_id,
            result: log,
          },
        })
      )
    }
  })

  subscriptionEventEmitter.on('evm_newHead_received', (newblock) => {
    try {
      for (let [key, value] of blockSubscriptionList) {
        if (value.socket.readyState === 2 || value.socket.readyState === 3) {
          blockSubscriptionList.delete(key)
          continue
        }
        // Update socket activity when sending newHeads data
        socketActivityMap.set(value.socket, Date.now())
        value.socket.send(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_subscription',
            params: {
              subscription: key,
              result: newblock,
            },
          })
        )
      }
    } catch (e) {
      return
    }
  })

  interface LOG_SUBSCRIPTION_PAYLOAD {
    subscription_id: string
    address: string[]
    topics: string[]
    ipport: string
  }
  subscriptionEventEmitter.on('evm_log_subscribe', async (payload: LOG_SUBSCRIPTION_PAYLOAD) => {
    console.log('Sending subscription request to log server')
    nestedCountersInstance.countEvent('websocket', 'evm_log_subscribe')
    const method = 'subscribe'
    evmLogProvider_ConnectionStream?.send(JSON.stringify({ method, params: payload }))
  })

  subscriptionEventEmitter.on('evm_log_unsubscribe', async (subscription_id: string) => {
    nestedCountersInstance.countEvent('websocket', 'evm_log_unsubscribe')
    const method = 'unsubscribe'
    evmLogProvider_ConnectionStream?.send(JSON.stringify({ method, params: { subscription_id } }))
  })

  subscriptionEventEmitter.on(
    'evm_newHead_subscribe',
    async (payload: { subscription_id: string; ipport: string }) => {
      console.log('Sending newHeads subscription request to log server')
      nestedCountersInstance.countEvent('websocket', 'evm_newHead_subscribe')
      const method = 'subscribe'
      if (
        !newHeadSubscriptionProvider_ConnectionStream ||
        newHeadSubscriptionProvider_ConnectionStream.readyState !== WebSocket.OPEN
      ) {
        console.log('Establishing new connection to log server for newHeads subscription')
        setupNewHeadSubscriptionProviderConnectionStream()
      }
      sendNewHeadsMessage({ method, params: payload })
    }
  )

  subscriptionEventEmitter.on('evm_newHead_unsubscribe', async (subscription_id: string) => {
    nestedCountersInstance.countEvent('websocket', 'evm_newHead_unsubscribe')
    const method = 'unsubscribe'
    sendNewHeadsMessage({ method, params: { subscription_id } })
  })
}

const constructRPCErrorRes = (
  ErrorMessage: string,
  ErrCode = -1,
  id: number
): {
  id: number
  jsonrpc: string
  error: {
    message: string
    code: number
  }
} => {
  return {
    id: id,
    jsonrpc: '2.0',
    error: {
      message: ErrorMessage,
      code: ErrCode,
    },
  }
}

const cleanupIntervalMs = CONFIG.websocket.cleanupIntervalMs // Run cleanup every 10 minutes

const cleanupStaleConnections = () => {
  connectionsByIP.forEach((sockets, ip) => {
    // Collect sockets to be removed in a separate array
    const socketsToRemove: WebSocket.WebSocket[] = []

    sockets.forEach((socket) => {
      if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        // Add socket to removal list instead of deleting directly
        socketsToRemove.push(socket)
      }
    })

    // Remove sockets after iteration to avoid concurrent modification
    socketsToRemove.forEach((socket) => {
      sockets.delete(socket)
      activeConnections--
    })

    // Remove IP entry if no sockets remain
    if (sockets.size === 0) {
      connectionsByIP.delete(ip)
    }
  })

  if (CONFIG.verbose) {
    console.log('Cleanup completed. Active connections:', activeConnections)
  }
}

// Start the periodic cleanup
setInterval(cleanupStaleConnections, cleanupIntervalMs)
