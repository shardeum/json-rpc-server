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
  const mockCreateLogger = jest.fn(() => mockLogger)
  return mockCreateLogger
})

describe('requestLogger middleware', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response> & { locals: { responseBody?: any } }
  let mockNext: NextFunction
  let mockLogger: { info: jest.Mock; error: jest.Mock }

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Get reference to mocked logger
    mockLogger = (createLogger as jest.Mock)()

    // Mock request object
    mockReq = {
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent',
      },
      body: { method: 'test', params: [] },
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

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'request',
        userAgent: 'test-agent',
        statusCode: 200,
        request: mockReq.body,
        response: responseBody,
      })
    )
  })

  it('should log error responses', () => {
    CONFIG.enableRequestLogger = true
    const errorResponse = { error: { code: -32600, message: 'Invalid Request' } }

    requestLogger(mockReq as Request, mockRes as Response, mockNext)

    // Simulate error response being sent
    mockRes.locals.responseBody = JSON.stringify(errorResponse)
    const onceHandler = (mockRes.once as jest.Mock).mock.calls[0][1]
    onceHandler()

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'request',
        userAgent: 'test-agent',
        statusCode: 200,
        request: mockReq.body,
        response: errorResponse,
      })
    )
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
      message: 'Failed to parse response body',
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
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        hashedIp: expect.any(String),
      })
    )

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

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        userAgent: 'Unknown',
      })
    )
  })

  it('should calculate response time correctly', async () => {
    CONFIG.enableRequestLogger = true
    const responseBody = { result: true }
    const delay = 100 // ms

    requestLogger(mockReq as Request, mockRes as Response, mockNext)

    // Wait for some time before sending response
    await new Promise((resolve) => setTimeout(resolve, delay))

    mockRes.locals.responseBody = JSON.stringify(responseBody)
    const onceHandler = (mockRes.once as jest.Mock).mock.calls[0][1]
    onceHandler()

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        responseTime: expect.any(Number),
      })
    )

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

  it('should handle all file logging env var conditions', async () => {
    // Save original env var
    const originalFileLogging = process.env.SHARDEUM_JSONRPC_FILE_LOGGING

    // Test when env var is not set (should default to true)
    delete process.env.SHARDEUM_JSONRPC_FILE_LOGGING
    jest.resetModules()
    jest.clearAllMocks()
    const mockCreateLogger = jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() })
    jest.doMock('../../../src/utils/logger', () => mockCreateLogger)
    await import('../../../src/middlewares/requestLogger')
    expect(mockCreateLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        enableFile: true,
        filename: 'logs/requests.log',
      })
    )

    // Test when env var is 'true'
    process.env.SHARDEUM_JSONRPC_FILE_LOGGING = 'true'
    jest.resetModules()
    jest.clearAllMocks()
    const mockCreateLogger2 = jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() })
    jest.doMock('../../../src/utils/logger', () => mockCreateLogger2)
    await import('../../../src/middlewares/requestLogger')
    expect(mockCreateLogger2).toHaveBeenCalledWith(
      expect.objectContaining({
        enableFile: true,
        filename: 'logs/requests.log',
      })
    )

    // Test when env var is 'false'
    process.env.SHARDEUM_JSONRPC_FILE_LOGGING = 'false'
    jest.resetModules()
    jest.clearAllMocks()
    const mockCreateLogger3 = jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() })
    jest.doMock('../../../src/utils/logger', () => mockCreateLogger3)
    await import('../../../src/middlewares/requestLogger')
    expect(mockCreateLogger3).toHaveBeenCalledWith(
      expect.objectContaining({
        enableFile: false,
        filename: 'logs/requests.log',
      })
    )

    // Restore original env var
    if (originalFileLogging === undefined) {
      delete process.env.SHARDEUM_JSONRPC_FILE_LOGGING
    } else {
      process.env.SHARDEUM_JSONRPC_FILE_LOGGING = originalFileLogging
    }
  })

  it('should create logger with correct console and file logging settings', async () => {
    // Save original env vars
    const originalConsoleLogging = process.env.SHARDEUM_JSONRPC_CONSOLE_LOGGING
    const originalFileLogging = process.env.SHARDEUM_JSONRPC_FILE_LOGGING

    // Test case 1: both console and file logging enabled
    process.env.SHARDEUM_JSONRPC_CONSOLE_LOGGING = 'true'
    process.env.SHARDEUM_JSONRPC_FILE_LOGGING = 'true'
    jest.resetModules()
    jest.clearAllMocks()
    const mockCreateLogger = jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() })
    jest.doMock('../../../src/utils/logger', () => mockCreateLogger)
    await import('../../../src/middlewares/requestLogger')
    expect(mockCreateLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        enableConsole: true,
        enableFile: true,
        filename: 'logs/requests.log',
      })
    )

    // Test case 2: console logging disabled, file logging enabled
    process.env.SHARDEUM_JSONRPC_CONSOLE_LOGGING = 'false'
    process.env.SHARDEUM_JSONRPC_FILE_LOGGING = 'true'
    jest.resetModules()
    jest.clearAllMocks()
    const mockCreateLogger2 = jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() })
    jest.doMock('../../../src/utils/logger', () => mockCreateLogger2)
    await import('../../../src/middlewares/requestLogger')
    expect(mockCreateLogger2).toHaveBeenCalledWith(
      expect.objectContaining({
        enableConsole: false,
        enableFile: true,
        filename: 'logs/requests.log',
      })
    )

    // Test case 3: console logging enabled, file logging disabled
    process.env.SHARDEUM_JSONRPC_CONSOLE_LOGGING = 'true'
    process.env.SHARDEUM_JSONRPC_FILE_LOGGING = 'false'
    jest.resetModules()
    jest.clearAllMocks()
    const mockCreateLogger3 = jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() })
    jest.doMock('../../../src/utils/logger', () => mockCreateLogger3)
    await import('../../../src/middlewares/requestLogger')
    expect(mockCreateLogger3).toHaveBeenCalledWith(
      expect.objectContaining({
        enableConsole: true,
        enableFile: false,
        filename: 'logs/requests.log',
      })
    )

    // Test case 4: both console and file logging disabled
    process.env.SHARDEUM_JSONRPC_CONSOLE_LOGGING = 'false'
    process.env.SHARDEUM_JSONRPC_FILE_LOGGING = 'false'
    jest.resetModules()
    jest.clearAllMocks()
    const mockCreateLogger4 = jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() })
    jest.doMock('../../../src/utils/logger', () => mockCreateLogger4)
    await import('../../../src/middlewares/requestLogger')
    expect(mockCreateLogger4).toHaveBeenCalledWith(
      expect.objectContaining({
        enableConsole: false,
        enableFile: false,
        filename: 'logs/requests.log',
      })
    )

    // Restore original env vars
    if (originalConsoleLogging === undefined) {
      delete process.env.SHARDEUM_JSONRPC_CONSOLE_LOGGING
    } else {
      process.env.SHARDEUM_JSONRPC_CONSOLE_LOGGING = originalConsoleLogging
    }

    if (originalFileLogging === undefined) {
      delete process.env.SHARDEUM_JSONRPC_FILE_LOGGING
    } else {
      process.env.SHARDEUM_JSONRPC_FILE_LOGGING = originalFileLogging
    }
  })

  it('should use correct logger level based on response result', () => {
    CONFIG.enableRequestLogger = true

    // Test case 1: response with result = true
    mockRes.locals.responseBody = JSON.stringify({ id: 1, jsonrpc: '2.0', result: true })

    requestLogger(mockReq as Request, mockRes as Response, mockNext)
    const onceHandler1 = (mockRes.once as jest.Mock).mock.calls[0][1]
    onceHandler1()

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'request',
        request: mockReq.body,
        response: { id: 1, jsonrpc: '2.0', result: true },
        userAgent: 'test-agent',
        hashedIp: expect.any(String),
        statusCode: 200,
        responseTime: expect.any(Number),
      })
    )

    // Test case 2: response with result = null
    jest.clearAllMocks()
    mockRes.locals.responseBody = JSON.stringify({ id: 1, jsonrpc: '2.0', result: null })

    requestLogger(mockReq as Request, mockRes as Response, mockNext)
    const onceHandler2 = (mockRes.once as jest.Mock).mock.calls[0][1]
    onceHandler2()

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'request',
        request: mockReq.body,
        response: { id: 1, jsonrpc: '2.0', result: null },
        userAgent: 'test-agent',
        hashedIp: expect.any(String),
        statusCode: 200,
        responseTime: expect.any(Number),
      })
    )

    // Test case 3: response with result = false
    jest.clearAllMocks()
    mockRes.locals.responseBody = JSON.stringify({ id: 1, jsonrpc: '2.0', result: false })

    requestLogger(mockReq as Request, mockRes as Response, mockNext)
    const onceHandler3 = (mockRes.once as jest.Mock).mock.calls[0][1]
    onceHandler3()

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'request',
        request: mockReq.body,
        response: { id: 1, jsonrpc: '2.0', result: false },
        userAgent: 'test-agent',
        hashedIp: expect.any(String),
        statusCode: 200,
        responseTime: expect.any(Number),
      })
    )
  })
})

describe('file logging configuration', () => {
  let originalFileLogging: string | undefined
  let originalConsoleLogging: string | undefined

  beforeEach(() => {
    originalFileLogging = process.env.SHARDEUM_JSONRPC_FILE_LOGGING
    originalConsoleLogging = process.env.SHARDEUM_JSONRPC_CONSOLE_LOGGING
  })

  afterEach(() => {
    if (originalFileLogging === undefined) {
      delete process.env.SHARDEUM_JSONRPC_FILE_LOGGING
    } else {
      process.env.SHARDEUM_JSONRPC_FILE_LOGGING = originalFileLogging
    }
    if (originalConsoleLogging === undefined) {
      delete process.env.SHARDEUM_JSONRPC_CONSOLE_LOGGING
    } else {
      process.env.SHARDEUM_JSONRPC_CONSOLE_LOGGING = originalConsoleLogging
    }
  })

  async function createLoggerWithConfig() {
    jest.resetModules()
    jest.clearAllMocks()
    const mockCreateLogger = jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() })
    jest.doMock('../../../src/utils/logger', () => mockCreateLogger)
    await import('../../../src/middlewares/requestLogger')
    return mockCreateLogger
  }

  it('should enable file logging by default when env var is not set', async () => {
    delete process.env.SHARDEUM_JSONRPC_FILE_LOGGING
    const mockCreateLogger = await createLoggerWithConfig()
    expect(mockCreateLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        enableFile: true,
        filename: 'logs/requests.log',
      })
    )
  })

  it('should enable file logging when env var is true', async () => {
    process.env.SHARDEUM_JSONRPC_FILE_LOGGING = 'true'
    const mockCreateLogger = await createLoggerWithConfig()
    expect(mockCreateLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        enableFile: true,
        filename: 'logs/requests.log',
      })
    )
  })

  it('should disable file logging when env var is false', async () => {
    process.env.SHARDEUM_JSONRPC_FILE_LOGGING = 'false'
    const mockCreateLogger = await createLoggerWithConfig()
    expect(mockCreateLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        enableFile: false,
        filename: 'logs/requests.log',
      })
    )
  })

  it('should enable both console and file logging when both env vars are true', async () => {
    process.env.SHARDEUM_JSONRPC_CONSOLE_LOGGING = 'true'
    process.env.SHARDEUM_JSONRPC_FILE_LOGGING = 'true'
    const mockCreateLogger = await createLoggerWithConfig()
    expect(mockCreateLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        enableConsole: true,
        enableFile: true,
        filename: 'logs/requests.log',
      })
    )
  })

  it('should disable console but enable file logging when configured', async () => {
    process.env.SHARDEUM_JSONRPC_CONSOLE_LOGGING = 'false'
    process.env.SHARDEUM_JSONRPC_FILE_LOGGING = 'true'
    const mockCreateLogger = await createLoggerWithConfig()
    expect(mockCreateLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        enableConsole: false,
        enableFile: true,
        filename: 'logs/requests.log',
      })
    )
  })

  it('should enable console but disable file logging when configured', async () => {
    process.env.SHARDEUM_JSONRPC_CONSOLE_LOGGING = 'true'
    process.env.SHARDEUM_JSONRPC_FILE_LOGGING = 'false'
    const mockCreateLogger = await createLoggerWithConfig()
    expect(mockCreateLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        enableConsole: true,
        enableFile: false,
        filename: 'logs/requests.log',
      })
    )
  })

  it('should disable both console and file logging when both env vars are false', async () => {
    process.env.SHARDEUM_JSONRPC_CONSOLE_LOGGING = 'false'
    process.env.SHARDEUM_JSONRPC_FILE_LOGGING = 'false'
    const mockCreateLogger = await createLoggerWithConfig()
    expect(mockCreateLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        enableConsole: false,
        enableFile: false,
        filename: 'logs/requests.log',
      })
    )
  })
})

describe('logger level selection', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response> & { locals: { responseBody?: any } }
  let mockNext: NextFunction
  let mockLogger: { info: jest.Mock; error: jest.Mock }

  beforeEach(() => {
    CONFIG.enableRequestLogger = true

    // Reset all mocks
    jest.clearAllMocks()

    // Get reference to mocked logger
    mockLogger = (createLogger as jest.Mock)()

    // Mock request object
    mockReq = {
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent',
      },
      body: { method: 'test', params: [] },
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
  })

  function simulateResponse(result: any) {
    mockRes.locals.responseBody = JSON.stringify({ id: 1, jsonrpc: '2.0', result })
    requestLogger(mockReq as Request, mockRes as Response, mockNext)
    const onceHandler = (mockRes.once as jest.Mock).mock.calls[0][1]
    onceHandler()
  }

  const expectedLogData = {
    type: 'request',
    request: { method: 'test', params: [] },
    userAgent: 'test-agent',
    hashedIp: expect.any(String),
    statusCode: 200,
    responseTime: expect.any(Number),
  }

  it('should use info level when result is true', () => {
    simulateResponse(true)
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        ...expectedLogData,
        response: { id: 1, jsonrpc: '2.0', result: true },
      })
    )
  })

  it('should use error level when result is null', () => {
    simulateResponse(null)
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        ...expectedLogData,
        response: { id: 1, jsonrpc: '2.0', result: null },
      })
    )
  })

  it('should use error level when result is false', () => {
    simulateResponse(false)
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        ...expectedLogData,
        response: { id: 1, jsonrpc: '2.0', result: false },
      })
    )
  })
})
