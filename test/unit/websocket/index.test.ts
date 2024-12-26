import WebSocket from 'ws'
import { onConnection } from '../../../src/websocket'
import { CONFIG } from '../../../src/config'
import { logSubscriptionList } from '../../../src/websocket/clients'
import { IncomingMessage } from 'http'

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

interface MockWebSocket extends jest.Mocked<WebSocket> {
  closeCallback: (code: number, reason: string) => void;
}

describe('WebSocket Connection Tests', () => {
  let mockSocket: MockWebSocket
  let mockIncomingMessage: Partial<IncomingMessage>

  beforeEach(() => {
    jest.useFakeTimers()
    mockSocket = {
      on: jest.fn((event, callback) => {
        // Store the callback for 'close' event
        if (event === 'close') {
          mockSocket.closeCallback = callback;
        }
      }),
      send: jest.fn(),
      close: jest.fn(),
      readyState: WebSocket.OPEN,
      // Add storage for close callback
      closeCallback: null as any,
    } as unknown as MockWebSocket

    // Mock IncomingMessage with a valid IP address
    mockIncomingMessage = {
      socket: {
        remoteAddress: '127.0.0.1'
      }
    } as Partial<IncomingMessage>
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

      await onConnection(mockSocket, mockIncomingMessage as IncomingMessage)

      // Fast forward past the timeout
      jest.advanceTimersByTime(CONFIG.websocket.connectionTimeoutMs + 100)

      // Verify the close was called with timeout message
      expect(mockSocket.close).toHaveBeenCalledTimes(1)
      expect(mockSocket.close).toHaveBeenCalledWith(1011, 'Connection timeout reached')

      // Verify activeConnections was decremented
      expect(websocketModule.activeConnections).toBe(0)
    })

    it('should clear timeout when connection closes normally', async () => {
      await onConnection(mockSocket, mockIncomingMessage as IncomingMessage)

      // Simulate connection close using the stored callback
      if (mockSocket.closeCallback) {
        // Call the close callback directly
        mockSocket.closeCallback(1000, 'Normal close')
      }

      // Fast forward past the timeout
      jest.advanceTimersByTime(CONFIG.websocket.connectionTimeoutMs + 100)

      // Verify that close was not called again after the timeout
      expect(mockSocket.close).not.toHaveBeenCalled()
    })
  })

  describe('Connection Limits', () => {
    it('should accept connections when below max limit', async () => {
      await onConnection(mockSocket, mockIncomingMessage as IncomingMessage)
      expect(mockSocket.close).not.toHaveBeenCalled()
    })

    it('should reject connections when at max limit', async () => {
      // Create max number of connections
      for (let i = 0; i < CONFIG.websocket.maxConnections; i++) {
        await onConnection(mockSocket, mockIncomingMessage as IncomingMessage)
      }

      await onConnection(mockSocket, mockIncomingMessage as IncomingMessage)
      expect(mockSocket.close).toHaveBeenCalledWith(1008, 'Connection closed: Your IP address has reached the maximum allowed connections. Please close an existing connection or try again later.')
    })
  })

  describe('Subscription Limits', () => {
    it('should reject subscriptions when at max limit per socket', async () => {
      await onConnection(mockSocket, mockIncomingMessage as IncomingMessage)

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
      await onConnection(mockSocket, mockIncomingMessage as IncomingMessage)

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
      await onConnection(mockSocket, mockIncomingMessage as IncomingMessage)

      const messageHandlerEntry = mockSocket.on.mock.calls.find((call) => call[0] === 'message')
      if (messageHandlerEntry) {
        const messageHandler = messageHandlerEntry[1].bind(mockSocket)
        messageHandler('invalid json')
        expect(mockSocket.close).toHaveBeenCalled()
      }
    })

    it('should handle invalid RPC version', async () => {
      await onConnection(mockSocket, mockIncomingMessage as IncomingMessage)

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
      await onConnection(mockSocket, mockIncomingMessage as IncomingMessage)

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
