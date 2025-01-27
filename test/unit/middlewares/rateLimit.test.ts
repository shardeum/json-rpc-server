import { Request, Response } from 'express'
import { rateLimitMiddleware, requestersList } from '../../../src/middlewares/rateLimit'
import { RequestersList } from '../../../src/middlewares/rateLimit/RequestersList'
import { CONFIG } from '../../../src/config'
import { jest } from '@jest/globals'
import * as fs from 'fs';
import { getTransactionObj } from '../../../src/middlewares/rateLimit/utils'

// Default config values - keep them outside tests for reuse
const DEFAULT_CONFIG = {
  rateLimit: true,
  rateLimitOption: {
    softReject: false,
    allowedTxCountInCheckInterval: 60,
    allowedHeavyRequestPerMin: 10,
    banIpAddress: true,
    banSpammerAddress: true,
    releaseFromBlacklistInterval: 60,
    spammerCheckInterval: 5
  },
  verbose: false,
  recordTxStatus: true,
  debugEndpointRateLimiting: {
    window: 60000,
    limit: 10
  }
}

// Test helpers
interface MockRequestOptions {
  ip?: string
  method?: string
  params?: any[]
  isBatch?: boolean
}

function createMockRequest({
  ip = '127.0.0.1',
  method = 'eth_sendRawTransaction',
  params = [mockRawTx],
  isBatch = false
}: MockRequestOptions = {}): Request {
  const body = isBatch 
    ? [{ method, params }, { method, params }]
    : { method, params }
  
  return {
    ip,
    body
  } as Request
}

function createMockResponse(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    send: jest.fn()
  } as unknown as Response
}

async function makeParallelRequests(
  count: number,
  req: Request,
  res: Response,
  next = jest.fn()
): Promise<void> {
  const promises = Array.from(
    { length: count },
    () => rateLimitMiddleware(req, res, next)
  )
  await Promise.all(promises)
}

// Mock config with minimal required properties
jest.mock('../../../src/config', () => ({
  CONFIG: { ...DEFAULT_CONFIG }
}))

// Mock the sleep function to resolve immediately
jest.mock('../../../src/middlewares/rateLimit/utils', () => {
  const actual = jest.requireActual<typeof import('../../../src/middlewares/rateLimit/utils')>('../../../src/middlewares/rateLimit/utils')
  return {
    ...actual,
    sleep: (ms: number) => Promise.resolve()
  }
})

// Mock the fs module
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn()
}));

// mock whitelist
jest.mock('../../../whitelist.json', () => [])

// mock blacklist
jest.mock('../../../blacklist.json', () => [])

// Valid raw transaction data (legacy transaction format)
const mockRawTx = '0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83'

describe('Rate Limiting', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    // Reset CONFIG to default values
    Object.assign(CONFIG, JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
    // Reset mock return values
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([]));
    requestersList.cleanUp()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should skip rate limiting when disabled in config', async () => {
    CONFIG.rateLimit = false
    const mockReq = createMockRequest({ method: 'eth_call', params: [] })
    const mockRes = createMockResponse()
    const mockNext = jest.fn()

    await rateLimitMiddleware(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })

  it('should allow valid single requests', async () => {
    const mockReq = createMockRequest({ method: 'eth_call', params: [] })
    const mockRes = createMockResponse()
    const mockNext = jest.fn()

    await rateLimitMiddleware(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })

  it('should allow valid batch requests', async () => {
    const mockReq = createMockRequest({ 
      method: 'eth_call',
      params: [],
      isBatch: true
    })
    const mockRes = createMockResponse()
    const mockNext = jest.fn()

    await rateLimitMiddleware(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })

  it('should reject when heavy request limit is exceeded and write to blacklist', async () => {
    const mockReq = createMockRequest()
    const mockRes = createMockResponse()
    const mockNext = jest.fn()

    await makeParallelRequests(11, mockReq, mockRes, mockNext)

    expect(mockRes.status).toHaveBeenCalledWith(429)
    expect(mockRes.send).toHaveBeenCalledWith('Rejected by rate-limiting')
    
    // Verify blacklist write
    expect(fs.writeFileSync).toHaveBeenCalled()
    const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0]
    expect(writeCall[0]).toContain('blacklist.json')
    expect(JSON.parse(writeCall[1] as string)).toContain('127.0.0.1')
  })

  it('should handle soft rejection when configured and write to blacklist', async () => {
    CONFIG.rateLimitOption.softReject = true
    const mockReq = createMockRequest()
    const mockRes = createMockResponse()
    const mockNext = jest.fn()

    await makeParallelRequests(11, mockReq, mockRes, mockNext)

    expect(mockRes.status).toHaveBeenCalledWith(503)
    expect(mockRes.send).toHaveBeenCalledWith('Network is currently busy. Please try again later.')
    
    // Verify blacklist write
    expect(fs.writeFileSync).toHaveBeenCalled()
    const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0]
    expect(writeCall[0]).toContain('blacklist.json')
    expect(JSON.parse(writeCall[1] as string)).toContain('127.0.0.1')
  })

  describe('Cleanup and Intervals', () => {
    it('should clear old IPs after interval', async () => {
      const mockReq = createMockRequest()
      const mockRes = createMockResponse()

      await makeParallelRequests(11, mockReq, mockRes)
      jest.advanceTimersByTime(DEFAULT_CONFIG.rateLimitOption.releaseFromBlacklistInterval * 60 * 1000)
      
      expect(fs.writeFileSync).toHaveBeenCalled()
    })

    it('should handle spammer check interval', async () => {
      const mockReq = createMockRequest()
      const mockRes = createMockResponse()

      await makeParallelRequests(
        DEFAULT_CONFIG.rateLimitOption.allowedTxCountInCheckInterval + 1,
        mockReq,
        mockRes
      )
      jest.advanceTimersByTime(DEFAULT_CONFIG.rateLimitOption.spammerCheckInterval * 60 * 1000)
      
      expect(fs.writeFileSync).toHaveBeenCalled()
    })
  })

  describe('Transaction Handling', () => {
    it('should track heavy addresses', async () => {
      const mockReq = createMockRequest()
      const mockRes = createMockResponse()

      await makeParallelRequests(5, mockReq, mockRes)
      expect(mockRes.status).not.toHaveBeenCalled()
    })

    it('skips over invalid transaction data', async () => {
      const mockReq = createMockRequest({ params: ['invalid-tx-data'] })
      const mockRes = createMockResponse()
      const mockNext = jest.fn()

      await rateLimitMiddleware(mockReq, mockRes, mockNext)
      expect(mockNext).toHaveBeenCalled()
      expect(mockRes.status).not.toHaveBeenCalled()
    })

    it('should track abused addresses', async () => {
      const mockReq = createMockRequest()
      const mockRes = createMockResponse()

      await makeParallelRequests(15, mockReq, mockRes)
      expect(fs.writeFileSync).toHaveBeenCalled()
    })
  })

  describe('Blacklist Management', () => {
    it('should not add duplicate IPs to blacklist', async () => {
      // Add IP directly to the blacklist
      const blacklistWrites = () => (fs.writeFileSync as jest.Mock).mock.calls
        .filter(call => (call[0] as string).includes('blacklist.json'))
        .length;

      expect(blacklistWrites()).toBe(0)
      requestersList.addToBlacklist('127.0.0.1');
      
      expect(blacklistWrites()).toBe(1);

      // Mock that reading the blacklist now returns the IP
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(['127.0.0.1']))

      // Verify IP is already in blacklist
      expect(requestersList.isIpBanned('127.0.0.1')).toBe(true)

      const mockReq = createMockRequest()
      const mockRes = createMockResponse()

      await makeParallelRequests(20, mockReq, mockRes)

      // Should not write to blacklist since IP is already there
      expect(blacklistWrites()).toBe(1)
    })

    it('should handle sender blacklisting', async () => {
      const mockReq = createMockRequest()
      const mockRes = createMockResponse()

      await makeParallelRequests(
        DEFAULT_CONFIG.rateLimitOption.allowedTxCountInCheckInterval + 1,
        mockReq,
        mockRes
      )
      await rateLimitMiddleware(mockReq, mockRes, jest.fn())
      
      expect(mockRes.status).toHaveBeenCalled()
    })
  })

  describe('Initialization', () => {
    let originalSetInterval: typeof setInterval
    
    beforeEach(() => {
      // Clear any existing instances
      requestersList.cleanUp()
      // Store original setInterval
      originalSetInterval = global.setInterval
    })

    afterEach(() => {
      // Restore original setInterval
      global.setInterval = originalSetInterval
    })

    it('should initialize with empty lists by default', () => {
      const instance = new RequestersList()
      expect(instance.isIpBanned('127.0.0.1')).toBe(false)
      expect(instance.isSenderBlacklisted('0x123')).toBe(false)
    })

    it('should initialize with provided blacklist', () => {
      const instance = new RequestersList(['127.0.0.1'])
      expect(instance.isIpBanned('127.0.0.1')).toBe(true)
      expect(instance.isIpBanned('127.0.0.2')).toBe(false)
    })

    it('should initialize with provided spammer list', () => {
      const instance = new RequestersList([], ['0x123'])
      expect(instance.isSenderBlacklisted('0x123')).toBe(true)
      expect(instance.isSenderBlacklisted('0x456')).toBe(false)
    })

    it('should initialize with provided whitelist', () => {
      const instance = new RequestersList([], [], ['127.0.0.1'])
      // Make a request that would normally be rejected
      const result = instance.isRequestOkay('127.0.0.1', 'eth_sendRawTransaction', [mockRawTx])
      expect(result).resolves.toBe(true)
    })

    it('should not set up intervals when rate limiting is disabled', () => {
      const mockSetInterval = jest.fn()
      global.setInterval = mockSetInterval as unknown as typeof setInterval

      CONFIG.rateLimit = false
      new RequestersList()
      
      expect(mockSetInterval).not.toHaveBeenCalled()
    })

    it('should set up intervals when rate limiting is enabled', () => {
      const mockSetInterval = jest.fn()
      global.setInterval = mockSetInterval as unknown as typeof setInterval

      CONFIG.rateLimit = true
      new RequestersList()
      
      // Should set up two intervals - one for cleanup and one for spammer check
      expect(mockSetInterval).toHaveBeenCalledTimes(2)
      
      // Verify intervals are set with correct timing
      const calls = mockSetInterval.mock.calls
      expect(calls[0][1]).toBe(DEFAULT_CONFIG.rateLimitOption.releaseFromBlacklistInterval * 60 * 1000) // First interval for cleanup
      expect(calls[1][1]).toBe(DEFAULT_CONFIG.rateLimitOption.spammerCheckInterval * 60 * 1000) // Second interval for spammer check
    })

    it('should throw error when not configured', () => {
      const mockSetInterval = jest.fn()
      global.setInterval = mockSetInterval as unknown as typeof setInterval

      CONFIG.rateLimit = true
      const configCopy = { ...CONFIG.rateLimitOption }
      CONFIG.rateLimitOption = { ...configCopy }
      delete (CONFIG.rateLimitOption as Partial<typeof configCopy>).releaseFromBlacklistInterval
      delete (CONFIG.rateLimitOption as Partial<typeof configCopy>).spammerCheckInterval
      
      expect(() => new RequestersList()).toThrow('Rate limit options are not set correctly')
    })
    it('should use default intervals when not configured', () => {
      (CONFIG.rateLimitOption as any).releaseFromBlacklistInterval = "abc";
      (CONFIG.rateLimitOption as any).spammerCheckInterval = "abc";
      expect(() => new RequestersList()).toThrow('Rate limit options are not set correctly: must be numbers')
    })
  })

  describe('clearOldIps Functionality', () => {
    beforeEach(() => {
      jest.clearAllMocks()
      jest.useFakeTimers()
      Object.assign(CONFIG, JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([]));
      requestersList.cleanUp()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should clear heavy requests older than one minute', async () => {
      const mockReq = createMockRequest()
      const mockRes = createMockResponse()

      // Make 5 requests at t=0
      await makeParallelRequests(5, mockReq, mockRes)
      const initialHeavyRequests = requestersList.heavyRequests.get('127.0.0.1')?.length
      expect(initialHeavyRequests).toBe(5)

      // Advance time by 30 seconds and make 3 more requests
      jest.advanceTimersByTime(30 * 1000)
      await makeParallelRequests(3, mockReq, mockRes)
      expect(requestersList.heavyRequests.get('127.0.0.1')?.length).toBe(8)

      // Advance time by 40 seconds (70 seconds total) and trigger clearOldIps
      jest.advanceTimersByTime(40 * 1000)
      requestersList.clearOldIps()

      // Only the 3 requests from 40 seconds ago should remain
      const remainingRequests = requestersList.heavyRequests.get('127.0.0.1')?.length
      expect(remainingRequests).toBe(3)
    })

    it('should unban IPs after one hour', async () => {
      // Add IP to blacklist
      requestersList.addToBlacklist('192.168.1.1')
      expect(requestersList.isIpBanned('192.168.1.1')).toBe(true)

      // Advance time by 59 minutes and verify IP is still banned
      jest.advanceTimersByTime(59 * 60 * 1000)
      requestersList.clearOldIps()
      expect(requestersList.isIpBanned('192.168.1.1')).toBe(true)

      // Advance time by 3 more minutes (61 minutes total)
      jest.advanceTimersByTime(3 * 60 * 1000)
      requestersList.clearOldIps()
      expect(requestersList.isIpBanned('192.168.1.1')).toBe(false)

      // Verify blacklist file was updated
      expect(fs.writeFileSync).toHaveBeenCalled()
      const lastWriteCall = (fs.writeFileSync as jest.Mock).mock.calls[(fs.writeFileSync as jest.Mock).mock.calls.length - 1]
      expect(lastWriteCall).toBeDefined()
      expect(JSON.parse(lastWriteCall[1] as string)).toEqual([])
    })

    it('should clear heavy addresses older than one minute', async () => {
      // Mock a transaction that will add a heavy address
      const mockReq = createMockRequest()
      const mockRes = createMockResponse()

      // Make 5 requests at t=0
      await makeParallelRequests(5, mockReq, mockRes)
      
      // Get the address from the mock transaction
      const tx = getTransactionObj({ raw: mockRawTx })
      const address = tx.getSenderAddress().toString()
      
      const initialHeavyAddresses = requestersList.heavyAddresses.get(address)?.length
      expect(initialHeavyAddresses).toBe(5)

      // Advance time by 30 seconds and make 3 more requests
      jest.advanceTimersByTime(30 * 1000)
      await makeParallelRequests(3, mockReq, mockRes)
      expect(requestersList.heavyAddresses.get(address)?.length).toBe(8)

      // Advance time by 40 seconds (70 seconds total) and trigger clearOldIps
      jest.advanceTimersByTime(40 * 1000)
      requestersList.clearOldIps()

      // Only the 3 requests from 40 seconds ago should remain
      const remainingAddresses = requestersList.heavyAddresses.get(address)?.length
      expect(remainingAddresses).toBe(3)
    })

    it('should handle clearing empty lists without errors', () => {
      // Create a new instance with empty lists
      const instance = new RequestersList()
      
      // Should not throw when clearing empty lists
      expect(() => instance.clearOldIps()).not.toThrow()
    })
  })
}) 