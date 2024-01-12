import WebSocket from 'ws'
import EventEmitter from 'events'
import { methods } from '../api'
import { logSubscriptionList } from './clients'
import * as crypto from 'crypto'
import { CONFIG } from '../config'
import { ipport } from '../server'
import { evmLogProvider_ConnectionStream } from './log_server'
import { SubscriptionDetails } from './clients'

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

export const onConnection = async (socket: WebSocket.WebSocket): Promise<void> => {
  socket.on('message', (message: string) => {
    console.log(`Received message: ${message}`)

    let request: Request = {
      jsonrpc: '',
      id: 0,
      method: '',
      params: [],
    }

    try {
      request = JSON.parse(message)
      console.log(request.params)
    } catch (e: unknown) {
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
        socket.send(JSON.stringify(err_res_obj))
        return
      }
      const res_obj = {
        id: request.id,
        jsonrpc: '2.0',
        result: result,
      }
      socket.send(JSON.stringify(res_obj))
      return
    }

    const method_name = request.method as string
    if (!methods[method_name as keyof typeof methods]) {
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
      try {
        if (
          typeof request.params[1] === 'object' &&
          'address' in request.params[1] &&
          'topics' in request.params[1]
        ) {
          // in this case we need to keep track of a connection
          // We will NOT keep track of connection for other interface call
          let subscription_id = crypto.randomBytes(32).toString('hex')
          subscription_id =
            '0x' + crypto.createHash('sha256').update(subscription_id).digest().toString('hex')
          subscription_id = subscription_id.substring(0, 46)
          request.params[10] = subscription_id
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
      if (!CONFIG.websocket.enabled || !CONFIG.websocket.serveSubscriptions) {
        socket.send(JSON.stringify(constructRPCErrorRes('Subscription serving disabled', -1, request.id)))
        return
      }
      request.params[10] = socket
    }

    // call interface handler
    methods[method_name as keyof typeof methods](request.params, callback)
  })

  socket.on('close', (code, reason) => {
    console.log(`WebSocket connection closed with code: ${code} and reason: ${reason}`)
    if (logSubscriptionList.getBySocket(socket)) {
      logSubscriptionList.getBySocket(socket)?.forEach((subscription_id) => {
        subscriptionEventEmitter.emit('evm_log_unsubscribe', subscription_id)
      })
      logSubscriptionList.removeBySocket(socket)
    }
    console.log(logSubscriptionList.getAll())
  })
}

export const subscriptionEventEmitter = new EventEmitter()

export const setupSubscriptionEventHandlers = (): void => {
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

  interface SUBSCRIPTION_PAYLOAD {
    subscription_id: string
    address: string[]
    topics: string[]
    ipport: string
  }
  subscriptionEventEmitter.on('evm_log_subscribe', async (payload: SUBSCRIPTION_PAYLOAD) => {
    console.log('Sending subscription request to log server')
    const method = 'subscribe'
    evmLogProvider_ConnectionStream?.send(JSON.stringify({ method, params: payload }))
  })

  subscriptionEventEmitter.on('evm_log_unsubscribe', async (subscription_id: string) => {
    const method = 'unsubscribe'
    evmLogProvider_ConnectionStream?.send(JSON.stringify({ method, params: { subscription_id } }))
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
