import { CONFIG } from '../config'
import { NextFunction, Request, Response } from 'express'

/**
 * Middleware function to inject the client IP address into the request body.
 * If the request method is 'eth_sendRawTransaction' and the 'recordTxStatus' flag is enabled,
 * the client IP address is added to the request parameters at index 1000.
 */
const injectIP = (req: Request, res: Response, next: NextFunction) => {
  if (req.body.method === 'eth_sendRawTransaction' && CONFIG.recordTxStatus) req.body.params[1000] = req.ip
  next()
  return
}

export default injectIP
