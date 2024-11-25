import { RequestersList } from '../utils'
import { Request, Response } from 'express'
import { rateLimitMiddleware } from '../middlewares/rateLimit'

describe('Rate Limiting', () => {
  let requestersList: RequestersList
  
  beforeEach(() => {
    requestersList = new RequestersList([], [])
  })

  it('should allow valid single requests', async () => {
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
  })

  it('should allow valid batch requests', async () => {
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
  })

  it('should reject when rate limit exceeded', async () => {
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

    // Make multiple requests to exceed rate limit
    for (let i = 0; i < 61; i++) {
      await rateLimitMiddleware(mockReq, mockRes, mockNext)
    }

    expect(mockRes.status).toHaveBeenCalledWith(503)
    expect(mockRes.send).toHaveBeenCalledWith('Rejected by rate-limiting')
  })
}) 