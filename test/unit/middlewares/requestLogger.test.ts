import { Request, Response, NextFunction } from 'express'
import requestLogger from '../../../src/middlewares/requestLogger'
import { CONFIG } from '../../../src/config'
import createLogger from '../../../src/utils/logger'

// Mock the logger module
jest.mock('../../../src/utils/logger', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
  }
  return jest.fn(() => mockLogger)
})

describe('requestLogger middleware', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response> & { locals: { responseBody?: any } }
  let mockNext: NextFunction
  let mockLogger: { info: jest.Mock; error: jest.Mock }

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()
    
    // Mock request object
    mockReq = {
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent'
      },
      body: { method: 'test', params: [] }
    }

    // Mock response object
    mockRes = {
      statusCode: 200,
      write: jest.fn(),
      end: jest.fn(),
      json: jest.fn(),
      send: jest.fn(),
      once: jest.fn(),
      locals: {},
    }

    // Mock next function
    mockNext = jest.fn()

    // Get reference to mocked logger
    mockLogger = (createLogger as jest.Mock)() as any
  })

  it('should not log when request logging is disabled', () => {
    const originalConfig = CONFIG.enableRequestLogger
    CONFIG.enableRequestLogger = false

    requestLogger(mockReq as Request, mockRes as Response, mockNext)

    expect(mockNext).toHaveBeenCalled()
    expect(mockLogger.info).not.toHaveBeenCalled()
    expect(mockLogger.error).not.toHaveBeenCalled()

    CONFIG.enableRequestLogger = originalConfig
  })

  it('should log successful requests', () => {
    CONFIG.enableRequestLogger = true
    const responseBody = { result: true, data: 'test' }

    requestLogger(mockReq as Request, mockRes as Response, mockNext)

    // Simulate response being sent
    mockRes.locals.responseBody = JSON.stringify(responseBody)
    const onceHandler = (mockRes.once as jest.Mock).mock.calls[0][1]
    onceHandler()

    expect(mockLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      type: 'request',
      userAgent: 'test-agent',
      statusCode: 200,
      request: mockReq.body,
      response: responseBody
    }))
  })

  it('should log error responses', () => {
    CONFIG.enableRequestLogger = true
    const errorResponse = { error: { code: -32600, message: 'Invalid Request' } }

    requestLogger(mockReq as Request, mockRes as Response, mockNext)

    // Simulate error response being sent
    mockRes.locals.responseBody = JSON.stringify(errorResponse)
    const onceHandler = (mockRes.once as jest.Mock).mock.calls[0][1]
    onceHandler()

    expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({
      type: 'request',
      userAgent: 'test-agent',
      statusCode: 200,
      request: mockReq.body,
      response: errorResponse
    }))
  })

  it('should handle invalid JSON in response body', () => {
    CONFIG.enableRequestLogger = true
    
    requestLogger(mockReq as Request, mockRes as Response, mockNext)

    // Simulate invalid JSON response
    mockRes.locals.responseBody = 'invalid-json'
    const onceHandler = (mockRes.once as jest.Mock).mock.calls[0][1]
    onceHandler()

    expect(mockLogger.error).toHaveBeenCalledWith({
      type: 'request',
      message: 'Failed to parse response body'
    })
  })

  it('should properly wrap response methods', () => {
    CONFIG.enableRequestLogger = true
    const testData = { result: true, data: 'test' }

    requestLogger(mockReq as Request, mockRes as Response, mockNext)

    // Test json method
    mockRes.json!(testData)
    expect(mockRes.locals.responseBody).toEqual(testData)

    // Test send method
    mockRes.send!(testData)
    expect(mockRes.locals.responseBody).toEqual(testData)

    // Test write method
    const chunk = Buffer.from(JSON.stringify(testData))
    mockRes?.write?.(chunk)
    expect(Buffer.concat([chunk]).toString()).toContain(JSON.stringify(testData))
  })

  it('should hash IP addresses for privacy', () => {
    CONFIG.enableRequestLogger = true
    const testIp = '192.168.1.1'
    mockReq.ip = testIp
    const responseBody = { result: true }

    requestLogger(mockReq as Request, mockRes as Response, mockNext)

    // Simulate response being sent
    mockRes.locals.responseBody = JSON.stringify(responseBody)
    const onceHandler = (mockRes.once as jest.Mock).mock.calls[0][1]
    onceHandler()

    // Verify that the IP is hashed using SHA-256
    expect(mockLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      hashedIp: expect.any(String)
    }))
    
    const logCall = mockLogger.info.mock.calls[0][0]
    expect(logCall.hashedIp).toMatch(/^[a-f0-9]{64}$/) // SHA-256 produces 64 character hex string
    expect(logCall.hashedIp).not.toContain(testIp) // Original IP should not be present
  })
}) 