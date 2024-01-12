import WebSocket from 'ws'
import { subscriptionEventEmitter } from '.'
import { CONFIG } from '../config'
import { logSubscriptionList } from './clients'

export let evmLogProvider_ConnectionStream: WebSocket | null = null

const log_server_ws_url = `ws://${CONFIG.log_server.ip}:${CONFIG.log_server.port}`

export const setupEvmLogProviderConnectionStream = (): void => {
  if ((CONFIG.websocket.enabled && CONFIG.websocket.serveSubscriptions) !== true) return
  if (evmLogProvider_ConnectionStream?.readyState === 1 || evmLogProvider_ConnectionStream?.readyState === 0)
    return

  evmLogProvider_ConnectionStream = new WebSocket.WebSocket(log_server_ws_url + '/evm_log_subscription')
  evmLogProvider_ConnectionStream.on('error', () => {
    // console.error(e); // removed e argument because it was not used when this line commented out
    evmLogProvider_ConnectionStream?.close()
  })

  evmLogProvider_ConnectionStream.on('open', function open() {
    console.log('LogServer Websocket Connection Established')
  })

  evmLogProvider_ConnectionStream.on('close', function close() {
    const socketsByIds = logSubscriptionList.getAll().indexedById

    socketsByIds.forEach((value) => {
      value.socket.close()
    })

    console.log('Attempting to establish websocket stream to log_server...')
    setTimeout(setupEvmLogProviderConnectionStream, 5000)
  })
  evmLogProvider_ConnectionStream.on('message', function message(data) {
    try {
      const message = JSON.parse(data.toString())
      if (message.method == 'subscribe') {
        if (!logSubscriptionList.getById(message.subscription_id)) {
          // unsubscribe
        }
        if (message.success) {
          console.log('Returning SubID')
          // logSubscriptionList.getById(message.subscription_id)?.socket.send(JSON.stringify({
          //   message: "throw a big fat error",
          // }))

          logSubscriptionList.getById(message.subscription_id)?.socket.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: logSubscriptionList.requestIdBySubscriptionId.get(message.subscription_id),
              result: message.subscription_id,
            })
          )
        } else {
          logSubscriptionList.getById(message.subscription_id)?.socket.send(
            JSON.stringify({
              jsonrpc: '2.0',
              error: {
                message: message.error.message,
                code: -1,
              },
            })
          )
        }
      }
      if (message.method == 'unsubscribe') {
        if (message.success) {
          logSubscriptionList.getById(message.subscription_id)?.socket.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: logSubscriptionList.requestIdBySubscriptionId.get(message.subscription_id),
              result: true,
            })
          )
          logSubscriptionList.removeById(message.subscription_id)
        } else {
          logSubscriptionList.getById(message.subscription_id)?.socket.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: logSubscriptionList.requestIdBySubscriptionId.get(message.subscription_id),
              result: false,
            })
          )
        }
      }
      if (message.method == 'log_found') {
        try {
          const logs = message.logs
          const subscription_id = message.subscription_id

          console.log('Received logs for subscription', subscription_id, logs.length)
          subscriptionEventEmitter.emit('evm_log_received', logs, subscription_id)
        } catch (e: unknown) {
          console.error(e)
        }
      }
    } catch (e) {
      console.log(e)
    }
  })
}
