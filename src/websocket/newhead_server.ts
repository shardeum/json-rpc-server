import WebSocket from 'ws'
import { CONFIG } from '../config'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { blockSubscriptionList } from './clients'
import { subscriptionEventEmitter } from '.'

export let newHeadSubscriptionProvider_ConnectionStream: WebSocket | null = null

const log_server_ws_url = `ws://${CONFIG.log_server.ip}:${CONFIG.log_server.port}`

export const setupNewHeadSubscriptionProviderConnectionStream = (): void => {
  if ((CONFIG.websocket.enabled && CONFIG.websocket.serveSubscriptions) !== true) return
  if (newHeadSubscriptionProvider_ConnectionStream?.readyState === WebSocket.OPEN) return

  console.log('Setting up newHeads subscription connection to log server...')
  newHeadSubscriptionProvider_ConnectionStream = new WebSocket(log_server_ws_url + '/newHead_subscription')

  newHeadSubscriptionProvider_ConnectionStream.on('error', (error) => {
    console.error('NewHeads subscription connection error:', error)
    newHeadSubscriptionProvider_ConnectionStream?.close()
  })

  newHeadSubscriptionProvider_ConnectionStream.on('open', function open() {
    console.log('NewHeads subscription connection established')
  })

  newHeadSubscriptionProvider_ConnectionStream.on('close', function close() {
    console.log('NewHeads subscription connection closed, attempting to reconnect...')
    // Don't close client subscriptions, just try to reconnect
    setTimeout(setupNewHeadSubscriptionProviderConnectionStream, 5000)
  })

  newHeadSubscriptionProvider_ConnectionStream.on('message', function message(data) {
    try {
      const message = JSON.parse(data.toString())
      if (message.method === 'newBlock_produced') {
        if (blockSubscriptionList.size === 0) return
        const block = message.payload
        subscriptionEventEmitter.emit('evm_newHead_received', block)
      }
    } catch (e) {
      console.error('Error processing newHeads message:', e)
      nestedCountersInstance.countEvent(
        'websocket_subscriptions',
        'Failed to broadcast new block to subscribers'
      )
    }
  })
}
