import { CONFIG } from '../config'
import { NextFunction, Request, Response } from 'express'

const rejectSubscription = (req: Request, res: Response, next: NextFunction) => {
  if (req.body.method === 'eth_subscribe' || req.body.method === 'eth_unsubscribe') {
    res.json({
      id: 1,
      jsonrpc: '2.0',
      error: {
        message: 'Http does not allow eth_subscription',
        code: -1,
      },
    })
  }
  next()
}

export default rejectSubscription
