import { CONFIG } from '../config'
import { NextFunction, Request, Response } from 'express'

const injectIP = (req: Request, res: Response, next: NextFunction): void => {
  if (req.body.method === 'eth_sendRawTransaction' && CONFIG.recordTxStatus) {
    const regex_str =
      /^(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}$/
    const regex = new RegExp(regex_str)
    if (regex.test(req.ip)) {
      req.body.ip = req.ip
    }
  }
  next()
  return
}

export default injectIP
