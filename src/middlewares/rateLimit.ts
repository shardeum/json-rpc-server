import { Request, Response, NextFunction } from 'express'
import { RequestersList } from '../utils'
import { CONFIG as config } from '../config'
import { sleep } from '../utils'
import blackList from '../../blacklist.json'
import spammerList from '../../spammerlist.json'

// Export for testing
export const requestersList = new RequestersList(blackList, spammerList)

interface RpcRequest {
  method: string
  params: any[]
}

async function handleRejection(res: Response, softReject: boolean): Promise<void> {
  if (softReject) {
    const randomSleepTime = 10 + Math.floor(Math.random() * 10)
    await sleep(randomSleepTime * 1000)
    res.status(503).send('Network is currently busy. Please try again later.')
  } else {
    res.status(429).send('Rejected by rate-limiting')
  }
}

async function checkRequest(ip: string, request: RpcRequest): Promise<boolean> {
  return await requestersList.isRequestOkay(ip, request.method, request.params)
}

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!config.rateLimit) {
    next()
    return
  }
  let ip = req.ip

  if (ip.substring(0, 7) == '::ffff:') {
    ip = ip.substring(7)
  }

  const requests: RpcRequest[] = Array.isArray(req.body) ? req.body : [req.body]

  try {
    const results = await Promise.all(
      requests.map(request => checkRequest(ip, request))
    )

    // If any request is not okay, reject the entire batch
    if (results.some(result => !result)) {
      await handleRejection(res, config.rateLimitOption.softReject)
      return
    }

    next()
  } catch (error) {
    console.error('Rate limiting error:', error)
    res.status(500).send('Internal server error')
  }
} 