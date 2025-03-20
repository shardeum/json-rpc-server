import { AxiosError } from 'axios'
import { RequestParamsLike } from 'jayson'
import crypto from 'crypto'
import { completeReadableReceipt } from '../external/Collector'
import { JSONRPCCallbackTypePlain } from 'jayson'
import axios from 'axios'

interface BuildGetTransactionByBlockNumberAndIndex {
  nestedCountersInstance: any
  ensureArrayArgs: any
  countFailedResponse: any
  logEventEmitter: any
  firstLineLogs: any
  collectorAPI: any
  extractTransactionObject: any
  countSuccessResponse: any
  config: any
  verbose: any
  errorBusy: any
}

export const buildGetTransactionByBlockNumberAndIndex = ({
  nestedCountersInstance,
  ensureArrayArgs,
  countFailedResponse,
  logEventEmitter,
  firstLineLogs,
  collectorAPI,
  extractTransactionObject,
  countSuccessResponse,
  config,
  verbose,
  errorBusy,
}: BuildGetTransactionByBlockNumberAndIndex) => {
  const eth_getTransactionByBlockNumberAndIndex = async (
    args: RequestParamsLike,
    callback: JSONRPCCallbackTypePlain
  ) => {
    const api_name = 'eth_getTransactionByBlockNumberAndIndex'
    nestedCountersInstance.countEvent('endpoint', api_name)
    if (!ensureArrayArgs(args, callback)) {
      countFailedResponse(api_name, 'Invalid params: non-array args')
      return
    }
    const ticket = crypto
      .createHash('sha1')
      .update(api_name + Math.random() + Date.now())
      .digest('hex')
    logEventEmitter.emit('fn_start', ticket, api_name, performance.now())

    let result: string | completeReadableReceipt | null | undefined = null
    try {
      const blockResp = await collectorAPI.getBlock((args as any)[0], 'hex_num', true)
      result = blockResp?.transactions[Number((args as any)[1])]
      if (result) {
        if (typeof result === 'object' && result.transactionIndex && (args as any)[1] !== undefined) {
          const transactionIndex = parseInt((args as any)[1], 16)
          if (!isNaN(transactionIndex)) {
            result.transactionIndex = '0x' + transactionIndex.toString(16)
          }
        }
        callback(null, result)
        countSuccessResponse(api_name, 'success', 'collector')
        logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
        return
      }
    } catch (e) {
      callback(errorBusy)
      countFailedResponse(api_name, 'exception in collectorAPI.getBlock')
      logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
    }
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_getTransactionByBlockNumberAndIndex', args) }
    let blockNumber = (args as any)[0]
    const index = parseInt((args as any)[1], 16)
    if (blockNumber !== 'latest' && blockNumber !== 'earliest') blockNumber = parseInt(blockNumber, 16)
    if (blockNumber === 'earliest') blockNumber = 0
    if (config.queryFromExplorer) {
      const explorerUrl = config.explorerUrl
      try {
        const res = await axios.get(`${explorerUrl}/api/transaction?blockNumber=${blockNumber}`)
        if (verbose) {
          console.log('url', `${explorerUrl}/api/transaction?blockNumber=${blockNumber}`)
          console.log('res', JSON.stringify(res.data))
        }

        let result
        if (res.data.success) {
          if (typeof index === 'number' && index >= 0 && index < res.data.transactions.length) {
            // eslint-disable-next-line security/detect-object-injection
            result = extractTransactionObject(res.data.transactions[index], index)
          }
        } else result = null

        const nodeUrl = config.explorerUrl
        if (verbose) console.log('TRANSACTION DETAIL', result)
        callback(null, result)
        countSuccessResponse(api_name, 'success', 'explorer')
        logEventEmitter.emit(
          'fn_end',
          ticket,
          { nodeUrl, success: res.data.transactions.length ? true : false },
          performance.now()
        )
      } catch (error) {
        /* prettier-ignore */ if (verbose) console.log('Error: eth_getTransactionByBlockNumberAndIndex', (error as AxiosError).message)
        callback(null, null)
        countFailedResponse(api_name, 'exception in axios.get')
        logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
      }
    } else {
      console.log('queryFromExplorer turned off. Could not process request')
      callback(null, null)
      countFailedResponse(api_name, 'queryFromExplorer turned off')
      logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
    }
    callback(null, result)
    countSuccessResponse(api_name, 'success', 'fallback')
    logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
  }

  return eth_getTransactionByBlockNumberAndIndex
}
