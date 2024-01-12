import { CONFIG } from '../config'
import { NextFunction, Request, Response } from 'express'

const injectIP = (req: Request, res: Response, next: NextFunction): void => {
  if (req.body.method === 'eth_sendRawTransaction' && CONFIG.recordTxStatus) req.body.params[1000] = req.ip
  next()
  return
}

export default injectIP
