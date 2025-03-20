import WebSocket from 'ws'
import { subscriptionEventEmitter } from '.'
import { CONFIG } from '../config'
import { blockSubscriptionList } from './clients'
import { Utils } from '@shardeum-foundation/lib-types'

export let newHeadSubscriptionProvider_ConnectionStream: WebSocket | null = null
const log_server_ws_url = `ws://${CONFIG.log_server.ip}:${CONFIG.log_server.port}`

const pendingSubscriptions: Array<{ method: string; params: any }> = []

export const setupNewHeadSubscriptionProviderConnectionStream = (): void => {
  console.log('[NewHeads] Setting up subscription provider connection...')
  if ((CONFIG.websocket.enabled && CONFIG.websocket.serveSubscriptions) !== true) {
    console.log('[NewHeads] Subscriptions are disabled, not setting up connection')
    return
  }

  if (newHeadSubscriptionProvider_ConnectionStream?.readyState === WebSocket.OPEN) {
    console.log('[NewHeads] Connection already open and ready')
    return
  }

  // If we're already trying to connect, just wait
  if (newHeadSubscriptionProvider_ConnectionStream?.readyState === WebSocket.CONNECTING) {
    console.log('[NewHeads] Connection attempt already in progress')
    return
  }

  if (newHeadSubscriptionProvider_ConnectionStream) {
    console.log('[NewHeads] Cleaning up existing connection')
    newHeadSubscriptionProvider_ConnectionStream.close()
    newHeadSubscriptionProvider_ConnectionStream = null
  }

  const fullUrl = log_server_ws_url + '/newHead_subscription'

  newHeadSubscriptionProvider_ConnectionStream = new WebSocket.WebSocket(fullUrl)

  newHeadSubscriptionProvider_ConnectionStream.on('error', (error) => {
    newHeadSubscriptionProvider_ConnectionStream?.close()
  })

  newHeadSubscriptionProvider_ConnectionStream.on('open', function open() {
    console.log('[NewHeads] Connection established successfully')
    while (pendingSubscriptions.length > 0) {
      const request = pendingSubscriptions.shift()
      if (request && newHeadSubscriptionProvider_ConnectionStream?.readyState === WebSocket.OPEN) {
        newHeadSubscriptionProvider_ConnectionStream.send(Utils.safeStringify(request))
      }
    }
  })

  newHeadSubscriptionProvider_ConnectionStream.on('close', function close() {
    console.log('[NewHeads] Connection closed, will attempt reconnect in 5 seconds')
    setTimeout(setupNewHeadSubscriptionProviderConnectionStream, 5000)
  })

  newHeadSubscriptionProvider_ConnectionStream.on('message', function message(data) {
    try {
      const message = Utils.safeJsonParse(data.toString())
      if (message.method === 'subscribe') {
        setTimeout(() => {
          if (!blockSubscriptionList.has(message.subscription_id)) {
            newHeadSubscriptionProvider_ConnectionStream?.send(
              Utils.safeStringify({
                method: 'unsubscribe',
                params: { subscription_id: message.subscription_id },
              })
            )
          }
        }, 100)
        return
      }
      if (message.method === 'unsubscribe') {
        if (message.success) {
          const subscription = blockSubscriptionList.get(message.subscription_id)
          try {
            subscription?.socket.send(
              Utils.safeStringify({
                jsonrpc: '2.0',
                id: subscription.rpc_request_id,
                result: true,
              })
            )
          } catch (error) {
            console.error('[NewHeads] Failed to send unsubscribe confirmation:', error)
          }
          blockSubscriptionList.delete(message.subscription_id)
        } else {
          try {
            const subscription = blockSubscriptionList.get(message.subscription_id)
            subscription?.socket.send(
              Utils.safeStringify({
                jsonrpc: '2.0',
                id: subscription.rpc_request_id,
                result: false,
              })
            )
          } catch (error) {
            console.error('[NewHeads] Failed to send unsubscribe failure message:', error)
          }
        }
      }
      if (message.method === 'newBlock_produced') {
        try {
          const block = message.payload
          subscriptionEventEmitter.emit('evm_newHead_received', block)
        } catch (e: unknown) {
          console.error('[NewHeads] Error processing new block:', e)
        }
      }
    } catch (e) {
      console.error('[NewHeads] Error parsing message:', e)
    }
  })
}

// Add a helper function to send or queue messages
export const sendNewHeadsMessage = (message: { method: string; params: any }): void => {
  if (
    !newHeadSubscriptionProvider_ConnectionStream ||
    newHeadSubscriptionProvider_ConnectionStream.readyState !== WebSocket.OPEN
  ) {
    pendingSubscriptions.push(message)
    if (
      !newHeadSubscriptionProvider_ConnectionStream ||
      newHeadSubscriptionProvider_ConnectionStream.readyState === WebSocket.CLOSED
    ) {
      setupNewHeadSubscriptionProviderConnectionStream()
    }
  } else {
    newHeadSubscriptionProvider_ConnectionStream.send(Utils.safeStringify(message))
  }
}
