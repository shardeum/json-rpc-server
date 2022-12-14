import { bufferToHex } from 'ethereumjs-util'
import { getTransactionObj } from '../utils'

const util = require('util')
const CONFIG = require('../config')

const injectIP = (req: any, res: any, next: Function) => {
  if (req.body.method === 'eth_sendRawTransaction' && CONFIG.recordTxStatus) req.body.params[1000] = req.ip
  next()
  return
}

export default injectIP
