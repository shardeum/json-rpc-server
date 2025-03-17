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
  console.log('[NewHeads] Attempting to connect to:', fullUrl)

  newHeadSubscriptionProvider_ConnectionStream = new WebSocket.WebSocket(fullUrl)

  newHeadSubscriptionProvider_ConnectionStream.on('error', (error) => {
    console.error('[NewHeads] WebSocket error:', error)
    console.log(
      '[NewHeads] Connection state before error:',
      newHeadSubscriptionProvider_ConnectionStream?.readyState
    )
    newHeadSubscriptionProvider_ConnectionStream?.close()
  })

  newHeadSubscriptionProvider_ConnectionStream.on('open', function open() {
    console.log('[NewHeads] Connection established successfully')
    console.log('[NewHeads] Pending subscriptions to process:', pendingSubscriptions.length)
    while (pendingSubscriptions.length > 0) {
      const request = pendingSubscriptions.shift()
      if (request && newHeadSubscriptionProvider_ConnectionStream?.readyState === WebSocket.OPEN) {
        console.log('[NewHeads] Processing pending subscription:', request)
        newHeadSubscriptionProvider_ConnectionStream.send(Utils.safeStringify(request))
      }
    }
  })

  newHeadSubscriptionProvider_ConnectionStream.on('close', function close() {
    console.log('[NewHeads] Connection closed, will attempt reconnect in 5 seconds')
    console.log('[NewHeads] Current active subscriptions:', blockSubscriptionList.size)
    console.log('[NewHeads] Pending subscriptions:', pendingSubscriptions.length)
    setTimeout(setupNewHeadSubscriptionProviderConnectionStream, 5000)
  })

  newHeadSubscriptionProvider_ConnectionStream.on('message', function message(data) {
    try {
      const message = Utils.safeJsonParse(data.toString())
      console.log('[NewHeads] Received message:', message)

      if (message.method === 'subscribe') {
        console.log('[NewHeads] Processing subscribe message for subscription:', message.subscription_id)
        console.log('[NewHeads] Current subscriptions:', Array.from(blockSubscriptionList.keys()))

        if (!blockSubscriptionList.has(message.subscription_id)) {
          console.log('[NewHeads] Subscription not found in blockSubscriptionList, unsubscribing')
          newHeadSubscriptionProvider_ConnectionStream?.send(
            Utils.safeStringify({
              method: 'unsubscribe',
              params: { subscription_id: message.subscription_id },
            })
          )
        }
        return
      }

      if (message.method === 'unsubscribe') {
        console.log('[NewHeads] Processing unsubscribe message for subscription:', message.subscription_id)
        console.log('[NewHeads] Unsubscribe success:', message.success)

        if (message.success) {
          const subscription = blockSubscriptionList.get(message.subscription_id)
          console.log('[NewHeads] Found subscription to remove:', subscription ? 'yes' : 'no')
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
          console.log('[NewHeads] Subscription removed. Remaining subscriptions:', blockSubscriptionList.size)
        } else {
          try {
            const subscription = blockSubscriptionList.get(message.subscription_id)
            console.log('[NewHeads] Unsubscribe failed, sending failure message')
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
        console.log('[NewHeads] Processing new block')
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
  console.log('[NewHeads] Attempting to send message:', message)
  console.log('[NewHeads] Connection state:', newHeadSubscriptionProvider_ConnectionStream?.readyState)

  if (
    !newHeadSubscriptionProvider_ConnectionStream ||
    newHeadSubscriptionProvider_ConnectionStream.readyState !== WebSocket.OPEN
  ) {
    console.log('[NewHeads] Connection not ready, queueing message')
    pendingSubscriptions.push(message)
    console.log('[NewHeads] Current pending subscriptions:', pendingSubscriptions.length)

    if (
      !newHeadSubscriptionProvider_ConnectionStream ||
      newHeadSubscriptionProvider_ConnectionStream.readyState === WebSocket.CLOSED
    ) {
      console.log('[NewHeads] Connection closed, initiating reconnect')
      setupNewHeadSubscriptionProviderConnectionStream()
    }
  } else {
    console.log('[NewHeads] Connection ready, sending message immediately')
    newHeadSubscriptionProvider_ConnectionStream.send(Utils.safeStringify(message))
  }
}