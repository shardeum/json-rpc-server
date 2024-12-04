import WebSocket from 'ws'
import { onConnection } from '../../../src/websocket'
import { CONFIG } from '../../../src/config'
import { logSubscriptionList } from '../../../src/websocket/clients'

// Mock WebSocket
jest.mock('ws')

// Mock the entire websocket/index module
jest.mock('../../../src/websocket', () => {
  const originalModule = jest.requireActual('../../../src/websocket')
  return {
    ...originalModule,
    activeConnections: 0,
  }
})

// Mock the methods object from the API module
jest.mock('../../../src/api', () => ({
  methods: {
    eth_getBalance: jest.fn(),
    eth_blockNumber: jest.fn(),
    eth_sendRawTransaction: jest.fn(),
  },
}))

// Mock external APIs
jest.mock('../../../src/external/Collector', () => ({
  collectorAPI: {
    fetchAccount: jest.fn(),
    getBlock: jest.fn(),
    getTransactionByHash: jest.fn(),
  },
}))

jest.mock('../../../src/websocket/log_server', () => ({
  evmLogProvider_ConnectionStream: jest.fn(),
}))

describe('WebSocket Connection Tests', () => {
  let mockSocket: jest.Mocked<WebSocket>

  beforeEach(() => {
    jest.useFakeTimers()
    mockSocket = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: WebSocket.OPEN,
    } as unknown as jest.Mocked<WebSocket>
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  describe('Connection Timeout', () => {
    it('should close connection after timeout period', async () => {
      // Clear any existing mocks
      jest.clearAllMocks()

      // Import the mocked module
      const websocketModule = require('../../../src/websocket')
      websocketModule.activeConnections = 0

      await onConnection(mockSocket)

      // Fast forward past the timeout
      jest.advanceTimersByTime(CONFIG.websocket.connectionTimeoutMs + 100)

      // Verify the close was called with timeout message
      expect(mockSocket.close).toHaveBeenCalledTimes(1)
      expect(mockSocket.close).toHaveBeenCalledWith(1011, 'Connection timeout reached')

      // Verify activeConnections was decremented
      expect(websocketModule.activeConnections).toBe(0)
    })

    it('should clear timeout when connection closes normally', async () => {
      // Mock logSubscriptionList.getBySocket to return a Set
      jest.spyOn(logSubscriptionList, 'getBySocket').mockImplementation(() => new Set(['dummy-subscription']))
      await onConnection(mockSocket)

      // Simulate connection close
      const closeCallbackEntry = mockSocket.on.mock.calls.find((call) => call[0] === 'close')

      if (closeCallbackEntry) {
        const closeCallback = closeCallbackEntry[1].bind(mockSocket)
        closeCallback(1000, 'Normal close')
      }

      // Fast forward past the timeout
      jest.advanceTimersByTime(CONFIG.websocket.connectionTimeoutMs + 100)

      // Close should have been called once for the normal close, not for timeout
      expect(mockSocket.close).toHaveBeenCalledWith(1000, 'Normal close')
    })
  })

  describe('Connection Limits', () => {
    it('should accept connections when below max limit', async () => {
      await onConnection(mockSocket)
      expect(mockSocket.close).not.toHaveBeenCalled()
    })

    it('should reject connections when at max limit', async () => {
      // Create max number of connections
      for (let i = 0; i < CONFIG.websocket.maxConnections; i++) {
        await onConnection(mockSocket)
      }

      // Try one more connection
      await onConnection(mockSocket)
      expect(mockSocket.close).toHaveBeenCalledWith(1003, 'Server busy. Please try again later.')
    })
  })

  describe('Subscription Limits', () => {
    it('should reject subscriptions when at max limit per socket', async () => {
      await onConnection(mockSocket)

      // Get the message handler
      const messageHandlerEntry = mockSocket.on.mock.calls.find((call) => call[0] === 'message')
      if (messageHandlerEntry) {
        const messageHandler = messageHandlerEntry[1].bind(mockSocket)

        // Mock subscription list
        jest.spyOn(logSubscriptionList, 'getBySocket').mockImplementation(() => new Set(['sub1', 'sub2']))

        // Attempt to subscribe
        const subscribeRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_subscribe',
          params: [{}, { address: '0x123' }],
        }

        messageHandler(JSON.stringify(subscribeRequest))

        expect(mockSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('Maximum subscriptions per connection reached')
        )
      }
    })

    it('should accept subscriptions when below max limit', async () => {
      await onConnection(mockSocket)

      // Get the message handler
      const messageHandlerEntry = mockSocket.on.mock.calls.find((call) => call[0] === 'message')
      if (messageHandlerEntry) {
        const messageHandler = messageHandlerEntry[1].bind(mockSocket)

        // Mock subscription list to return fewer than max subscriptions
        jest.spyOn(logSubscriptionList, 'getBySocket').mockImplementation(() => new Set(['sub1']))

        // Attempt to subscribe
        const subscribeRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_subscribe',
          params: [{}, { address: '0x123' }],
        }

        messageHandler(JSON.stringify(subscribeRequest))

        expect(mockSocket.send).not.toHaveBeenCalledWith(
          expect.stringContaining('Maximum subscriptions per connection reached')
        )
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid JSON messages', async () => {
      await onConnection(mockSocket)

      const messageHandlerEntry = mockSocket.on.mock.calls.find((call) => call[0] === 'message')
      if (messageHandlerEntry) {
        const messageHandler = messageHandlerEntry[1].bind(mockSocket)
        messageHandler('invalid json')
        expect(mockSocket.close).toHaveBeenCalled()
      }
    })

    it('should handle invalid RPC version', async () => {
      await onConnection(mockSocket)

      const messageHandlerEntry = mockSocket.on.mock.calls.find((call) => call[0] === 'message')
      if (messageHandlerEntry) {
        const messageHandler = messageHandlerEntry[1].bind(mockSocket)

        const invalidRequest = {
          jsonrpc: '1.0',
          id: 1,
          method: 'eth_subscribe',
          params: [],
        }

        messageHandler(JSON.stringify(invalidRequest))

        expect(mockSocket.close).toHaveBeenCalledWith(1002, 'Invalid rpc socket frame')
      }
    })
  })

  describe('Connection Cleanup', () => {
    it('should clean up resources on connection close', async () => {
      await onConnection(mockSocket)

      const closeHandlerEntry = mockSocket.on.mock.calls.find((call) => call[0] === 'close')
      if (closeHandlerEntry) {
        const closeHandler = closeHandlerEntry[1].bind(mockSocket)

        // Mock subscription list
        jest.spyOn(logSubscriptionList, 'getBySocket').mockImplementation(() => new Set(['sub1']))
        jest.spyOn(logSubscriptionList, 'removeBySocket').mockImplementation(() => {})

        closeHandler(1000, 'Normal close')

        expect(logSubscriptionList.removeBySocket).toHaveBeenCalledWith(mockSocket)
      }
    })
  })
})
