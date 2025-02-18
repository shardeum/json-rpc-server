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

  it('should handle write method with different parameter combinations', () => {
    CONFIG.enableRequestLogger = true
    const testData = { result: true, data: 'test' }
    const chunk = Buffer.from(JSON.stringify(testData))
    const mockWrite = jest.fn()
    
    // Mock response object with only required fields
    const res = {
      statusCode: 200,
      write: mockWrite,
      end: jest.fn(),
      json: jest.fn(),
      send: jest.fn(),
      once: jest.fn(),
      locals: {},
    }
    mockRes = res as unknown as Response & { locals: { responseBody?: any } }

    requestLogger(mockReq as Request, mockRes as Response, mockNext)

    // Test write with chunk only
    res.write(chunk)
    
    // Test write with chunk and encoding
    res.write(chunk, 'utf8')
    
    // Test write with chunk and callback
    const callback = (error: Error | null | undefined) => {}
    res.write(chunk, callback)
    
    // Test write with chunk, encoding, and callback
    res.write(chunk, 'utf8', callback)

    expect(mockWrite).toHaveBeenCalledTimes(4)
  })

  it('should handle end method with different parameter combinations', () => {
    CONFIG.enableRequestLogger = true
    const testData = { result: true, data: 'test' }
    const chunk = Buffer.from(JSON.stringify(testData))
    const mockEnd = jest.fn().mockImplementation((chunk, encoding, callback) => {
      if (callback) {
        callback()
      }
    })
    
    // Mock response object with only required fields
    const res = {
      statusCode: 200,
      write: jest.fn(),
      end: mockEnd,
      json: jest.fn(),
      send: jest.fn(),
      once: jest.fn(),
      locals: {},
    }
    mockRes = res as unknown as Response & { locals: { responseBody?: any } }

    requestLogger(mockReq as Request, mockRes as Response, mockNext)

    // Test end with no parameters
    res.end()
    
    // Test end with chunk
    res.end(chunk)
    
    // Test end with chunk and encoding
    res.end(chunk, 'utf8')
    
    const mockCallback = jest.fn()
    // Test end with chunk, encoding, and callback
    res.end(chunk, 'utf8', mockCallback)

    expect(mockCallback).toHaveBeenCalledTimes(1)

    expect(mockEnd).toHaveBeenCalledTimes(4)
  })

  it('should handle missing user-agent header', () => {
    CONFIG.enableRequestLogger = true
    mockReq.headers = {} // Remove user-agent header
    const responseBody = { result: true }

    requestLogger(mockReq as Request, mockRes as Response, mockNext)

    mockRes.locals.responseBody = JSON.stringify(responseBody)
    const onceHandler = (mockRes.once as jest.Mock).mock.calls[0][1]
    onceHandler()

    expect(mockLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      userAgent: 'Unknown'
    }))
  })

  it('should calculate response time correctly', async () => {
    CONFIG.enableRequestLogger = true
    const responseBody = { result: true }
    const delay = 100 // ms

    requestLogger(mockReq as Request, mockRes as Response, mockNext)

    // Wait for some time before sending response
    await new Promise(resolve => setTimeout(resolve, delay))

    mockRes.locals.responseBody = JSON.stringify(responseBody)
    const onceHandler = (mockRes.once as jest.Mock).mock.calls[0][1]
    onceHandler()

    expect(mockLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      responseTime: expect.any(Number)
    }))

    const logCall = mockLogger.info.mock.calls[0][0]
    expect(logCall.responseTime).toBeGreaterThanOrEqual(delay)
  })

  it('should handle non-Buffer chunks in write method', () => {
    CONFIG.enableRequestLogger = true
    const stringChunk = 'test-string'
    const mockWrite = jest.fn()
    
    // Mock response object with only required fields
    const res = {
      statusCode: 200,
      write: mockWrite,
      end: jest.fn(),
      json: jest.fn(),
      send: jest.fn(),
      once: jest.fn(),
      locals: {},
    }
    mockRes = res as unknown as Response & { locals: { responseBody?: any } }

    requestLogger(mockReq as Request, mockRes as Response, mockNext)

    // Test with string chunk
    res.write(stringChunk)
    
    // Test with string chunk and encoding
    res.write(stringChunk, 'utf8')

    expect(mockWrite).toHaveBeenCalledTimes(2)
  })

}) 