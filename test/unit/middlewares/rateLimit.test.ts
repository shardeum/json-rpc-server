import { Request, Response } from 'express'
import { rateLimitMiddleware, requestersList } from '../../../src/middlewares/rateLimit'
import { CONFIG } from '../../../src/config'

// Mock the Collector class
jest.mock('../../../src/external/Collector', () => ({
  Collector: jest.fn().mockImplementation(() => ({
    fetchAccount: jest.fn(),
    getBlock: jest.fn(),
    getTransactionByHash: jest.fn()
  })),
  collectorAPI: {
    fetchAccount: jest.fn(),
    getBlock: jest.fn(),
    getTransactionByHash: jest.fn()
  }
}))

// Mock the RequestersList instance
jest.mock('../../../src/utils', () => {
  return {
    RequestersList: jest.fn().mockImplementation(() => ({
      isRequestOkay: jest.fn()
    })),
    sleep: jest.fn().mockImplementation(() => Promise.resolve())
  }
})

// Mock config with minimal required properties
jest.mock('../../../src/config', () => ({
  CONFIG: {
    rateLimit: true,
    rateLimitOption: {
      softReject: false,
      allowedTxCountInCheckInterval: 60
    }
  }
}))

describe('Rate Limiting', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset config to default state
    CONFIG.rateLimit = true
  })

  it('should skip rate limiting when disabled in config', async () => {
    CONFIG.rateLimit = false

    const mockReq = {
      socket: { remoteAddress: '127.0.0.1' },
      body: {
        method: 'eth_call',
        params: []
      }
    } as Request

    const mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    } as unknown as Response

    const mockNext = jest.fn()

    await rateLimitMiddleware(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
    expect(requestersList.isRequestOkay).not.toHaveBeenCalled()
  })

  it('should allow valid single requests', async () => {
    // Setup the mock for this specific test
    jest.spyOn(requestersList, 'isRequestOkay').mockResolvedValueOnce(true)

    const mockReq = {
      socket: { remoteAddress: '127.0.0.1' },
      body: {
        method: 'eth_call',
        params: []
      }
    } as Request

    const mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    } as unknown as Response

    const mockNext = jest.fn()

    await rateLimitMiddleware(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
    expect(requestersList.isRequestOkay).toHaveBeenCalledTimes(1)
  })

  it('should allow valid batch requests', async () => {
    const spy = jest.spyOn(requestersList, 'isRequestOkay')
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)

    const mockReq = {
      socket: { remoteAddress: '127.0.0.1' },
      body: [
        {
          method: 'eth_call',
          params: []
        },
        {
          method: 'eth_getBalance',
          params: []
        }
      ]
    } as Request

    const mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    } as unknown as Response

    const mockNext = jest.fn()

    await rateLimitMiddleware(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('should reject when rate limit exceeded', async () => {
    jest.spyOn(requestersList, 'isRequestOkay').mockResolvedValue(false)

    const mockReq = {
      socket: { remoteAddress: '127.0.0.1' },
      body: {
        method: 'eth_sendRawTransaction',
        params: []
      }
    } as Request

    const mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    } as unknown as Response

    const mockNext = jest.fn()

    await rateLimitMiddleware(mockReq, mockRes, mockNext)
    expect(mockRes.status).toHaveBeenCalledWith(503)
    expect(mockRes.send).toHaveBeenCalledWith('Rejected by rate-limiting')
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('should handle soft rejection when configured', async () => {
    jest.spyOn(requestersList, 'isRequestOkay').mockResolvedValue(false)

    // Temporarily modify config for this test
    const originalConfig = CONFIG.rateLimitOption.softReject
    CONFIG.rateLimitOption.softReject = true

    const mockReq = {
      socket: { remoteAddress: '127.0.0.1' },
      body: {
        method: 'eth_sendRawTransaction',
        params: []
      }
    } as Request

    const mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    } as unknown as Response

    const mockNext = jest.fn()

    await rateLimitMiddleware(mockReq, mockRes, mockNext)
    expect(mockRes.status).toHaveBeenCalledWith(503)
    expect(mockRes.send).toHaveBeenCalledWith('Network is currently busy. Please try again later.')
    expect(mockNext).not.toHaveBeenCalled()

    // Restore original config
    CONFIG.rateLimitOption.softReject = originalConfig
  })

  it('should handle errors gracefully', async () => {
    jest.spyOn(requestersList, 'isRequestOkay').mockRejectedValueOnce(new Error('Mock error'))

    const mockReq = {
      socket: { remoteAddress: '127.0.0.1' },
      body: {
        method: 'eth_call',
        params: []
      }
    } as Request

    const mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    } as unknown as Response

    const mockNext = jest.fn()

    await rateLimitMiddleware(mockReq, mockRes, mockNext)
    expect(mockRes.status).toHaveBeenCalledWith(500)
    expect(mockRes.send).toHaveBeenCalledWith('Internal server error during rate limiting')
    expect(mockNext).not.toHaveBeenCalled()
  })
}) 