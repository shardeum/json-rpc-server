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
  console.log('[NewHeads] Setting up subscription provider connection...')
  if ((CONFIG.websocket.enabled && CONFIG.websocket.serveSubscriptions) !== true) {
    console.log('[NewHeads] Subscriptions are disabled, not setting up connection')
    return
  }
  if (
    newHeadSubscriptionProvider_ConnectionStream?.readyState === 1 ||
    newHeadSubscriptionProvider_ConnectionStream?.readyState === 0
  ) {
    console.log(
      '[NewHeads] Connection already exists or is connecting. State:',
      newHeadSubscriptionProvider_ConnectionStream.readyState
    )
    return
  }

  console.log('[NewHeads] Creating new WebSocket connection to:', log_server_ws_url + '/newHead_subscription')
  newHeadSubscriptionProvider_ConnectionStream = new WebSocket.WebSocket(
    log_server_ws_url + '/newHead_subscription'
  )

  newHeadSubscriptionProvider_ConnectionStream.on('error', (error) => {
    console.error('[NewHeads] Connection error:', error.message)
    console.error('[NewHeads] Full error:', error)
    newHeadSubscriptionProvider_ConnectionStream?.close()
  })

  newHeadSubscriptionProvider_ConnectionStream.on('open', function open() {
    console.log('[NewHeads] Connection established successfully')
    // Process any pending subscriptions
    console.log('[NewHeads] Pending subscriptions count:', pendingSubscriptions.length)
    while (pendingSubscriptions.length > 0) {
      const request = pendingSubscriptions.shift()
      if (request && newHeadSubscriptionProvider_ConnectionStream?.readyState === WebSocket.OPEN) {
        console.log('[NewHeads] Processing pending subscription:', request)
        newHeadSubscriptionProvider_ConnectionStream.send(JSON.stringify(request))
      }
    }
  })

  newHeadSubscriptionProvider_ConnectionStream.on('close', function close() {
    console.log('[NewHeads] Connection closed, will attempt reconnect in 5 seconds')
    setTimeout(setupNewHeadSubscriptionProviderConnectionStream, 5000)
  })

  newHeadSubscriptionProvider_ConnectionStream.on('message', function message(data) {
    try {
      console.log('[NewHeads] Received message:', data.toString())
      const message = Utils.safeJsonParse(data.toString())
      if (message.method === 'subscribe') {
        console.log('[NewHeads] Processing subscribe response for ID:', message.subscription_id)
        if (!blockSubscriptionList.has(message.subscription_id)) {
          console.log('[NewHeads] Subscription ID not found in blockSubscriptionList, unsubscribing')
          newHeadSubscriptionProvider_ConnectionStream?.send(
            JSON.stringify({
              method: 'unsubscribe',
              params: { subscription_id: message.subscription_id },
            })
          )
          return
        }
        if (message.success) {
          console.log('[NewHeads] Subscription successful, sending confirmation to client')
          const subscription = blockSubscriptionList.get(message.subscription_id)
          subscription?.socket.send(
            Utils.safeStringify({
              jsonrpc: '2.0',
              id: subscription.rpc_request_id,
              result: message.subscription_id,
            })
          )
        } else {
          console.log('[NewHeads] Subscription failed:', message.error?.message)
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
        console.log('[NewHeads] Processing unsubscribe response for ID:', message.subscription_id)
        if (message.success) {
          const subscription = blockSubscriptionList.get(message.subscription_id)
          try {
            console.log('[NewHeads] Unsubscribe successful, sending confirmation to client')
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
            console.log('[NewHeads] Unsubscribe failed')
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
        console.log('[NewHeads] New block received')
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
  if (
    !newHeadSubscriptionProvider_ConnectionStream ||
    newHeadSubscriptionProvider_ConnectionStream.readyState !== WebSocket.OPEN
  ) {
    console.log('[NewHeads] Connection not ready, queuing message')
    console.log(
      '[NewHeads] Current connection state:',
      newHeadSubscriptionProvider_ConnectionStream?.readyState
    )
    pendingSubscriptions.push(message)
    if (
      !newHeadSubscriptionProvider_ConnectionStream ||
      newHeadSubscriptionProvider_ConnectionStream.readyState === WebSocket.CLOSED
    ) {
      console.log('[NewHeads] Connection closed or not exists, initiating new connection')
      setupNewHeadSubscriptionProviderConnectionStream()
    }
  } else {
    console.log('[NewHeads] Connection ready, sending message immediately')
    newHeadSubscriptionProvider_ConnectionStream.send(JSON.stringify(message))
  }
}