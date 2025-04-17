import { AxiosError } from 'axios'
import { RequestParamsLike } from 'jayson'
import crypto from 'crypto'
import { JSONRPCCallbackTypePlain } from 'jayson'
import axios from 'axios'
import NestedCounters from '../utils/nestedCounters'
import { RequestMethod, requestWithRetry } from '../utils'

interface BuildGetBlockTransactionCountByNumber {
  nestedCountersInstance: NestedCounters
  ensureArrayArgs: (args: RequestParamsLike, callback: JSONRPCCallbackTypePlain) => boolean
  countFailedResponse: (api: string, reason: string) => void
  logEventEmitter: any
  firstLineLogs: boolean
  collectorAPI: any
  countSuccessResponse: any
  config: any
  verbose: boolean
}

export const buildGetBlockTransactionCountByNumber = ({
  nestedCountersInstance,
  ensureArrayArgs,
  countFailedResponse,
  logEventEmitter,
  firstLineLogs,
  collectorAPI,
  countSuccessResponse,
  config,
  verbose,
}: BuildGetBlockTransactionCountByNumber): ((
  args: RequestParamsLike,
  callback: JSONRPCCallbackTypePlain
) => Promise<void>) => {
  const eth_getBlockTransactionCountByNumber = async (
    args: RequestParamsLike,
    callback: JSONRPCCallbackTypePlain
  ): Promise<void> => {
    const api_name = 'eth_getBlockTransactionCountByNumber'
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
    /* prettier-ignore */ if (firstLineLogs) { console.log('Running eth_getBlockTransactionCountByNumber', args) }

    let blockNumber = (args as any[])[0]

    // Check for unsupported block identifiers
    if (['pending', 'safe', 'finalized'].includes(blockNumber)) {
      const errorMessage = `Block identifier '${blockNumber}' is not supported`
      console.log(errorMessage)
      callback(
        {
          code: -32000,
          message: errorMessage,
        },
        null
      )
      countFailedResponse(api_name, errorMessage)
      logEventEmitter.emit('fn_end', ticket, { success: false, error: errorMessage }, performance.now())
      return
    }

    if (!config.collectorSourcing.enabled && !config.queryFromExplorer)
      console.log('Both collectorSourcing and queryFromExplorer turned off. Could not process request')

    if (config.collectorSourcing.enabled || config.queryFromExplorer) {
      if (blockNumber !== 'latest' && blockNumber !== 'earliest') blockNumber = parseInt(blockNumber, 16).toString()
      if (blockNumber === 'latest' || blockNumber === 'earliest') {
        const res = await requestWithRetry(RequestMethod.Get, `/eth_getBlockByNumber?blockNumber=${blockNumber}`)
        if (res.data.block) blockNumber = res.data.block.number
      }
    }

    if (config.collectorSourcing.enabled) {
      const res = await collectorAPI.getTransactionByBlock({ blockNumber, countOnly: true })
      if (res !== null) {
        const result = '0x' + (res as number).toString(16)
        if (verbose) console.log('BLOCK TRANSACTIONS COUNT DETAIL', result)
        callback(null, result)
        countSuccessResponse(api_name, 'success', 'collector')
        logEventEmitter.emit('fn_end', ticket, { success: true }, performance.now())
        return
      }
    }
    if (config.queryFromExplorer) {
      const explorerUrl = config.explorerUrl
      try {
        const url = `${explorerUrl}/api/transaction?blockNumber=${blockNumber}&countOnly=true`
        const res = await axios.get(url)
        if (verbose) {
          console.log('url', url)
          console.log('res', JSON.stringify(res.data))
        }
        if (res.data.error) console.log('error', res.data.error)
        if (res.data.totalTransactions || res.data.totalTransactions === 0) {
          const result = '0x' + res.data.totalTransactions.toString(16)

          const nodeUrl = config.explorerUrl
          if (verbose) console.log('BLOCK TRANSACTIONS COUNT DETAIL', result)
          callback(null, result)
          countSuccessResponse(api_name, 'success', 'explorer')
          logEventEmitter.emit(
            'fn_end',
            ticket,
            { nodeUrl, success: res.data.totalTransactions ? true : false },
            performance.now()
          )
          return
        }
      } catch (e) {
        if (verbose) console.log((e as AxiosError).message)
      }
    }
    callback(null, null)
    logEventEmitter.emit('fn_end', ticket, { success: false }, performance.now())
  }

  return eth_getBlockTransactionCountByNumber
}
