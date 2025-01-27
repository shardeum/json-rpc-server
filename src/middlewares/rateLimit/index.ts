import { Request, Response, NextFunction } from 'express'
import { CONFIG as config } from '../../config'
import { RpcRequest } from './types'
import { MESSAGES } from './constants'
import { sleep } from './utils'
import { RequestersList } from './RequestersList'
import blackList from '../../../blacklist.json'
import spammerList from '../../../spammerlist.json'
import whiteList from '../../../whitelist.json'

// Create a single instance for the application
export const requestersList = new RequestersList(blackList, spammerList, whiteList)

async function handleRejection(res: Response, softReject: boolean): Promise<void> {
  if (softReject) {
    const randomSleepTime = 10 + Math.floor(Math.random() * 10)
    await sleep(randomSleepTime * 1000)
    res.status(503).send(MESSAGES.NETWORK_BUSY)
  } else {
    res.status(429).send(MESSAGES.RATE_LIMIT_EXCEEDED)
  }
}

export async function checkRequest(ip: string, request: RpcRequest): Promise<boolean> {
  const result = await requestersList.isRequestOkay(ip, request.method, request.params)
  return result
}

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!config.rateLimit) {
    next()
    return
  }

  let ip = req.ip
  if (ip.substring(0, 7) === '::ffff:') {
    ip = ip.substring(7)
  }

  const requests: RpcRequest[] = Array.isArray(req.body) ? req.body : [req.body]
  
  try {
    const results = await Promise.all(requests.map((request) => checkRequest(ip, request)))
    const allRequestsOk = results.every((result) => result)
  
    // If any request is not okay, reject the entire batch
    if (!allRequestsOk) {
      await handleRejection(res, config.rateLimitOption.softReject)
      return
    }

    next()
  } catch (error) {
    res.status(500).send(MESSAGES.INTERNAL_ERROR)
  }
}

// Export only what's needed by other modules
export { RpcRequest, MESSAGES }
export const isIpBanned = requestersList.isIpBanned.bind(requestersList)
