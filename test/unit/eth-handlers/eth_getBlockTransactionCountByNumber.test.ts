import { buildGetBlockTransactionCountByNumber } from '../../../src/eth-handlers/eth_getBlockTransactionCountByNumber'
import axios from 'axios'
import { RequestParamsLike } from 'jayson'
import { RequestMethod } from '../../../src/utils'

// Mock dependencies
jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

// Mock crypto for the ticket generation
jest.mock('crypto', () => ({
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnValue({
      digest: jest.fn().mockReturnValue('test-ticket-hash'),
    }),
  }),
}))

// Mock requestWithRetry
jest.mock('../../../src/utils', () => ({
  RequestMethod: {
    Get: 'get',
    Post: 'post',
  },
  requestWithRetry: jest.fn().mockResolvedValue({
    data: {
      block: { number: '123' },
    },
  }),
}))

describe('eth_getBlockTransactionCountByNumber handler', () => {
  // Common test values
  const blockNumber = '0x1234'
  const blockNumberTag = 'latest'
  const pendingBlockTag = 'pending'
  const safeBlockTag = 'safe'
  const finalizedBlockTag = 'finalized'

  // Declare mocks
  let mockNestedCountersInstance: any
  let mockEnsureArrayArgs: jest.Mock
  let mockCountFailedResponse: jest.Mock
  let mockLogEventEmitter: any
  let mockCollectorAPI: any
  let mockCountSuccessResponse: jest.Mock
  let mockConfig: any
  let mockCallback: jest.Mock
  let eth_getBlockTransactionCountByNumber: any

  // Initialize all mocks before each test
  beforeEach(() => {
    // Create fresh mocks for all dependencies
    mockNestedCountersInstance = {
      countEvent: jest.fn(),
    }
    mockEnsureArrayArgs = jest.fn()
    mockCountFailedResponse = jest.fn()
    mockLogEventEmitter = {
      emit: jest.fn(),
    }
    mockCollectorAPI = {
      getTransactionByBlock: jest.fn(),
    }
    mockCountSuccessResponse = jest.fn()
    mockConfig = {
      collectorSourcing: {
        enabled: true,
      },
      queryFromExplorer: true,
      explorerUrl: 'https://explorer.example.com',
    }
    mockCallback = jest.fn()

    // Reset axios mock
    mockedAxios.get.mockReset()

    // Build the handler function with fresh mocks
    eth_getBlockTransactionCountByNumber = buildGetBlockTransactionCountByNumber({
      nestedCountersInstance: mockNestedCountersInstance,
      ensureArrayArgs: mockEnsureArrayArgs,
      countFailedResponse: mockCountFailedResponse,
      logEventEmitter: mockLogEventEmitter,
      firstLineLogs: false,
      collectorAPI: mockCollectorAPI,
      countSuccessResponse: mockCountSuccessResponse,
      config: mockConfig,
      verbose: false,
    })
  })

  describe('Input validation', () => {
    beforeEach(() => {
      // Setup ensureArrayArgs to return false for this specific test group
      mockEnsureArrayArgs.mockReturnValue(false)
    })

    it('should reject non-array arguments', async () => {
      // Call the function with non-array args
      await eth_getBlockTransactionCountByNumber({ invalid: true } as RequestParamsLike, mockCallback)

      // Verify behavior
      expect(mockNestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'endpoint',
        'eth_getBlockTransactionCountByNumber'
      )
      expect(mockEnsureArrayArgs).toHaveBeenCalledWith({ invalid: true }, mockCallback)
      expect(mockCountFailedResponse).toHaveBeenCalledWith(
        'eth_getBlockTransactionCountByNumber',
        'Invalid params: non-array args'
      )
      expect(mockCallback).not.toHaveBeenCalled()
    })
  })

  describe('Unsupported block identifiers', () => {
    beforeEach(() => {
      // Setup ensureArrayArgs to return true for this test group
      mockEnsureArrayArgs.mockReturnValue(true)
    })

    it('should reject "pending" block identifier', async () => {
      // Call the function with 'pending' block tag
      await eth_getBlockTransactionCountByNumber([pendingBlockTag], mockCallback)

      // Verify behavior
      expect(mockCallback).toHaveBeenCalledWith(
        {
          code: -32000,
          message: `Block identifier '${pendingBlockTag}' is not supported`,
        },
        null
      )
      expect(mockCountFailedResponse).toHaveBeenCalledWith(
        'eth_getBlockTransactionCountByNumber',
        `Block identifier '${pendingBlockTag}' is not supported`
      )
    })

    it('should reject "safe" block identifier', async () => {
      // Call the function with 'safe' block tag
      await eth_getBlockTransactionCountByNumber([safeBlockTag], mockCallback)

      // Verify behavior
      expect(mockCallback).toHaveBeenCalledWith(
        {
          code: -32000,
          message: `Block identifier '${safeBlockTag}' is not supported`,
        },
        null
      )
      expect(mockCountFailedResponse).toHaveBeenCalledWith(
        'eth_getBlockTransactionCountByNumber',
        `Block identifier '${safeBlockTag}' is not supported`
      )
    })

    it('should reject "finalized" block identifier', async () => {
      // Call the function with 'finalized' block tag
      await eth_getBlockTransactionCountByNumber([finalizedBlockTag], mockCallback)

      // Verify behavior
      expect(mockCallback).toHaveBeenCalledWith(
        {
          code: -32000,
          message: `Block identifier '${finalizedBlockTag}' is not supported`,
        },
        null
      )
      expect(mockCountFailedResponse).toHaveBeenCalledWith(
        'eth_getBlockTransactionCountByNumber',
        `Block identifier '${finalizedBlockTag}' is not supported`
      )
    })
  })

  describe('Collector API path', () => {
    beforeEach(() => {
      // Setup ensureArrayArgs to return true for this test group
      mockEnsureArrayArgs.mockReturnValue(true)
    })

    it('should return transaction count from collector with hex block number', async () => {
      const txCount = 5

      // Mock the collectorAPI.getTransactionByBlock response
      mockCollectorAPI.getTransactionByBlock.mockResolvedValue(txCount)

      // Call the function
      await eth_getBlockTransactionCountByNumber([blockNumber], mockCallback)

      // Verify behavior
      expect(mockCollectorAPI.getTransactionByBlock).toHaveBeenCalledWith({
        blockNumber: parseInt(blockNumber, 16).toString(),
        countOnly: true,
      })
      expect(mockCallback).toHaveBeenCalledWith(null, '0x5')
      expect(mockCountSuccessResponse).toHaveBeenCalledWith(
        'eth_getBlockTransactionCountByNumber',
        'success',
        'collector'
      )
    })

    it('should return transaction count from collector with "latest" tag', async () => {
      const txCount = 10

      // Mock the collectorAPI.getTransactionByBlock response
      mockCollectorAPI.getTransactionByBlock.mockResolvedValue(txCount)

      // Call the function
      await eth_getBlockTransactionCountByNumber([blockNumberTag], mockCallback)

      // Verify behavior
      expect(mockCollectorAPI.getTransactionByBlock).toHaveBeenCalledWith({
        blockNumber: '123',
        countOnly: true,
      })
      expect(mockCallback).toHaveBeenCalledWith(null, '0xa')
      expect(mockCountSuccessResponse).toHaveBeenCalledWith(
        'eth_getBlockTransactionCountByNumber',
        'success',
        'collector'
      )
    })

    it('should handle collector API returning null', async () => {
      // Mock the collectorAPI.getTransactionByBlock to return null
      mockCollectorAPI.getTransactionByBlock.mockResolvedValue(null)

      // Call the function
      await eth_getBlockTransactionCountByNumber([blockNumber], mockCallback)

      // Collector API returning null should fall through to Explorer API
      expect(mockCollectorAPI.getTransactionByBlock).toHaveBeenCalledWith({
        blockNumber: parseInt(blockNumber, 16).toString(),
        countOnly: true,
      })
      // We should attempt to call the explorer API
      expect(mockedAxios.get).toHaveBeenCalled()
    })
  })

  describe('Explorer API path', () => {
    beforeEach(() => {
      // Setup ensureArrayArgs to return true for this test group
      mockEnsureArrayArgs.mockReturnValue(true)

      // Setup collector API to return null to trigger Explorer path
      mockCollectorAPI.getTransactionByBlock.mockResolvedValue(null)
    })

    it('should fetch transaction count from explorer when collector API returns null', async () => {
      const txCount = 15

      // Setup mock explorer response
      const mockExplorerResponse = {
        data: {
          totalTransactions: txCount,
        },
      }
      mockedAxios.get.mockResolvedValue(mockExplorerResponse)

      // Call the function
      await eth_getBlockTransactionCountByNumber([blockNumber], mockCallback)

      // Verify behavior
      const decimalBlockNumber = parseInt(blockNumber, 16).toString()
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${mockConfig.explorerUrl}/api/transaction?blockNumber=${decimalBlockNumber}&countOnly=true`
      )
      expect(mockCallback).toHaveBeenCalledWith(null, '0xf')
      expect(mockCountSuccessResponse).toHaveBeenCalledWith(
        'eth_getBlockTransactionCountByNumber',
        'success',
        'explorer'
      )
    })

    it('should handle zero transactions case', async () => {
      // Setup mock explorer response with zero transactions
      const mockExplorerResponse = {
        data: {
          totalTransactions: 0,
        },
      }
      mockedAxios.get.mockResolvedValue(mockExplorerResponse)

      // Call the function
      await eth_getBlockTransactionCountByNumber([blockNumber], mockCallback)

      // Verify behavior
      expect(mockCallback).toHaveBeenCalledWith(null, '0x0')
      expect(mockCountSuccessResponse).toHaveBeenCalledWith(
        'eth_getBlockTransactionCountByNumber',
        'success',
        'explorer'
      )
    })

    it('should handle explorer API errors', async () => {
      // Setup mock explorer to throw an error
      mockedAxios.get.mockRejectedValue(new Error('Explorer API error'))

      // Call the function
      await eth_getBlockTransactionCountByNumber([blockNumber], mockCallback)

      // Verify behavior
      expect(mockCallback).toHaveBeenCalledWith(null, null)
    })

    it('should handle explorer API returning error in data', async () => {
      // Setup mock explorer response with error
      const mockExplorerResponse = {
        data: {
          error: 'Block not found',
        },
      }
      mockedAxios.get.mockResolvedValue(mockExplorerResponse)

      // Call the function
      await eth_getBlockTransactionCountByNumber([blockNumber], mockCallback)

      // Verify behavior
      expect(mockCallback).toHaveBeenCalledWith(null, null)
    })
  })

  describe('Configuration settings', () => {
    beforeEach(() => {
      // Setup ensureArrayArgs to return true for these tests
      mockEnsureArrayArgs.mockReturnValue(true)
    })

    it('should handle case when both collector and explorer are disabled', async () => {
      // Update config to disable both collector and explorer
      mockConfig.collectorSourcing.enabled = false
      mockConfig.queryFromExplorer = false

      // Call the function
      await eth_getBlockTransactionCountByNumber([blockNumber], mockCallback)

      // Verify behavior
      expect(mockCollectorAPI.getTransactionByBlock).not.toHaveBeenCalled()
      expect(mockedAxios.get).not.toHaveBeenCalled()
      expect(mockCallback).toHaveBeenCalledWith(null, null)
    })

    it('should try only explorer when collector is disabled', async () => {
      // Update config to disable collector but enable explorer
      mockConfig.collectorSourcing.enabled = false
      mockConfig.queryFromExplorer = true

      const txCount = 20

      // Setup mock explorer response
      const mockExplorerResponse = {
        data: {
          totalTransactions: txCount,
        },
      }
      mockedAxios.get.mockResolvedValue(mockExplorerResponse)

      // Call the function
      await eth_getBlockTransactionCountByNumber([blockNumber], mockCallback)

      // Verify behavior
      expect(mockCollectorAPI.getTransactionByBlock).not.toHaveBeenCalled()
      expect(mockedAxios.get).toHaveBeenCalled()
      expect(mockCallback).toHaveBeenCalledWith(null, '0x14')
    })

    it('should try only collector when explorer is disabled', async () => {
      // Update config to enable collector but disable explorer
      mockConfig.collectorSourcing.enabled = true
      mockConfig.queryFromExplorer = false

      const txCount = 25

      // Mock the collectorAPI.getTransactionByBlock response
      mockCollectorAPI.getTransactionByBlock.mockResolvedValue(txCount)

      // Call the function
      await eth_getBlockTransactionCountByNumber([blockNumber], mockCallback)

      // Verify behavior
      expect(mockCollectorAPI.getTransactionByBlock).toHaveBeenCalled()
      expect(mockedAxios.get).not.toHaveBeenCalled()
      expect(mockCallback).toHaveBeenCalledWith(null, '0x19')
    })
  })
})
