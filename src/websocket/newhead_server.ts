import WebSocket from 'ws'
import { subscriptionEventEmitter } from '.'
import { CONFIG } from '../config'
import { blockSubscriptionList } from './clients'
import { Utils } from '@shardeum-foundation/lib-types'

export let newHeadSubscriptionProvider_ConnectionStream: WebSocket | null = null
const log_server_ws_url = `ws://${CONFIG.log_server.ip}:${CONFIG.log_server.port}`

// Add a queue for pending subscription requests
const pendingSubscriptions: Array<{ method: string; params: any }> = []

export const setupNewHeadSubscriptionProviderConnectionStream = (): void => {
  if ((CONFIG.websocket.enabled && CONFIG.websocket.serveSubscriptions) !== true) return
  if (
    newHeadSubscriptionProvider_ConnectionStream?.readyState === 1 ||
    newHeadSubscriptionProvider_ConnectionStream?.readyState === 0
  )
    return

  newHeadSubscriptionProvider_ConnectionStream = new WebSocket.WebSocket(
    log_server_ws_url + '/newHead_subscription'
  )

  newHeadSubscriptionProvider_ConnectionStream.on('error', (error) => {
    console.error('NewHeads subscription connection error:', error)
    newHeadSubscriptionProvider_ConnectionStream?.close()
  })

  newHeadSubscriptionProvider_ConnectionStream.on('open', function open() {
    console.log('NewHeads Subscription Connection Established')
    // Process any pending subscriptions
    while (pendingSubscriptions.length > 0) {
      const request = pendingSubscriptions.shift()
      if (request && newHeadSubscriptionProvider_ConnectionStream?.readyState === WebSocket.OPEN) {
        newHeadSubscriptionProvider_ConnectionStream.send(JSON.stringify(request))
      }
    }
  })

  newHeadSubscriptionProvider_ConnectionStream.on('close', function close() {
    // Don't close client subscriptions, just try to reconnect
    console.log('NewHeads subscription connection closed, attempting to reconnect...')
    setTimeout(setupNewHeadSubscriptionProviderConnectionStream, 5000)
  })

  newHeadSubscriptionProvider_ConnectionStream.on('message', function message(data) {
    try {
      const message = Utils.safeJsonParse(data.toString())
      if (message.method === 'subscribe') {
        if (!blockSubscriptionList.has(message.subscription_id)) {
          // unsubscribe since we don't have this subscription
          newHeadSubscriptionProvider_ConnectionStream?.send(
            JSON.stringify({
              method: 'unsubscribe',
              params: { subscription_id: message.subscription_id },
            })
          )
          return
        }
        if (message.success) {
          console.log('Returning NewHeads SubID')
          const subscription = blockSubscriptionList.get(message.subscription_id)
          subscription?.socket.send(
            Utils.safeStringify({
              jsonrpc: '2.0',
              id: subscription.rpc_request_id,
              result: message.subscription_id,
            })
          )
        } else {
          const subscription = blockSubscriptionList.get(message.subscription_id)
          subscription?.socket.send(
            Utils.safeStringify({
              jsonrpc: '2.0',
              error: {
                message: message.error?.message || 'Subscription failed',
                code: -1,
              },
            })
          )
          blockSubscriptionList.delete(message.subscription_id)
        }
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
            console.error('Failed to send message on WebSocket:', error)
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
            console.error('Failed to send message on WebSocket:', error)
          }
        }
      }
      if (message.method === 'newBlock_produced') {
        try {
          const block = message.payload
          console.log('Received new block')
          subscriptionEventEmitter.emit('evm_newHead_received', block)
        } catch (e: unknown) {
          console.error(e)
        }
      }
    } catch (e) {
      console.log(e)
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
    newHeadSubscriptionProvider_ConnectionStream.send(JSON.stringify(message))
  }
}