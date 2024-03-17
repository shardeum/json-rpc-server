/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosRequestConfig } from 'axios'
import { verbose, firstLineLogs } from '../api'
import { CONFIG } from '../config'
import { LogQueryRequest, TxByBlockRequest } from '../types'
import { BaseExternal, axiosWithRetry } from './BaseExternal'
import {
  TransactionFactory,
  FeeMarketEIP1559Transaction,
  AccessListEIP2930Transaction,
  AccessList,
} from '@ethereumjs/tx'
import { bufferToHex, toBuffer } from 'ethereumjs-util'
import { Err, NewErr, NewInternalErr } from './Err'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { BlockCacheManager } from '../cache/BlockCacheManager'
import { getBlock } from 'web3/lib/commonjs/eth.exports'
import { sleep } from '../utils'

class Collector extends BaseExternal {
  private blockCacheManager: BlockCacheManager

  private pendingRequests: Set<string>

  constructor(baseURL: string) {
    super(baseURL, 3, {
      'Content-Type': 'application/json',
    })
    this.blockCacheManager = new BlockCacheManager(
      CONFIG.blockCacheSettings.lastNBlocksSize,
      CONFIG.blockCacheSettings.lruMBlocksSize
    )
    this.pendingRequests = new Set<string>()
  }

  async getLogsByFilter(request: LogQueryRequest): Promise<any[] | null> {
    if (!CONFIG.collectorSourcing.enabled) return null
    nestedCountersInstance.countEvent('collector', 'getLogsByFilter')
    /* prettier-ignore */ if (firstLineLogs) console.log(`Collector: getLogsByFilter call for request: ${JSON.stringify(request)}`)
    try {
      const url = this.buildLogAPIUrl(request, this.baseUrl)
      /* prettier-ignore */ if (verbose) console.log(`Collector: getLogsByFilter built log API URL: ${url}`)

      const res = await axios.get(url)

      if (!res.data.success) return null

      const logs = res.data.logs.map((el: any) => el.log)
      return logs
    } catch (e) {
      nestedCountersInstance.countEvent('collector', 'getLogsByFilter-error')
      console.error('An error occurred for Collector.getLogsByFilter:', e)
      return null
    }
  }

  async getTransactionByHash(txHash: string): Promise<readableTransaction | Err | null> {
    if (!CONFIG.collectorSourcing.enabled) return NewErr('Collector sourcing is not enabled')
    nestedCountersInstance.countEvent('collector', 'getTransactionByHash')
    /* prettier-ignore */ if (firstLineLogs) console.log(`Collector: getTransactionByHash call for txHash: ${txHash}`)
    const requestConfig: AxiosRequestConfig = {
      method: 'get',
      url: `${this.baseUrl}/api/transaction?txHash=${txHash}`,
      headers: this.defaultHeaders,
    }

    try {
      /* prettier-ignore */ if (verbose) console.log(`Collector: getTransactionByHash requestConfig: ${JSON.stringify(requestConfig)}`)
      const res = await axiosWithRetry<{ success: boolean; transactions: any }>(requestConfig)
      /* prettier-ignore */ if (verbose) console.log(`Collector: getTransactionByHash res: ${JSON.stringify(res.data)}`)
      if (!res.data.success) return null

      const tx = res.data.transactions && res.data.transactions[0] ? res.data.transactions[0] : null

      const result = tx ? this.decodeTransaction(tx) : null

      /* prettier-ignore */ if (verbose) console.log(`Collector: getTransactionByHash result: ${JSON.stringify(result)}`)
      return result
    } catch (error) {
      nestedCountersInstance.countEvent('collector', 'getTransactionByHash-error')
      console.error('Collector: Error getting transaction by hash', error)
      return NewInternalErr('Collector: Error getting transaction by hash')
    }
  }

  async getTransactionReceipt(txHash: string): Promise<any | Err | null> {
    if (!CONFIG.collectorSourcing.enabled) return NewErr('Collector: collectorSourcing is not enabled')
    nestedCountersInstance.countEvent('collector', 'getTransactionReceipt')
    /* prettier-ignore */ if (firstLineLogs) console.log(`Collector: getTransactionReceipt call for txHash: ${txHash}`)
    const requestConfig: AxiosRequestConfig = {
      method: 'get',
      url: `${this.baseUrl}/api/transaction?txHash=${txHash}`,
      headers: this.defaultHeaders,
    }
    try {
      const res = await axiosWithRetry<{ success: boolean; transactions: any }>(requestConfig)
      /* prettier-ignore */ if (verbose) console.log(`Collector: getTransactionReceipt res: ${JSON.stringify(res.data)}`)
      if (!res.data.success) return null

      const result = res.data.transactions ? res.data.transactions[0] : null

      /* prettier-ignore */ if (verbose) console.log(`Collector: getTransactionReceipt result: ${JSON.stringify(result)}`)
      return result
    } catch (error) {
      nestedCountersInstance.countEvent('collector', 'getTransactionReceipt-error')
      console.error('Collector: Error getting transaction receipt', error)
      return NewInternalErr('Collector: Error getting transaction receipt')
    }
  }

  async getTxReceiptDetails(txHash: string): Promise<any | null> {
    if (!CONFIG.collectorSourcing.enabled) return null
    nestedCountersInstance.countEvent('collector', 'getTxReceiptDetails')
    /* prettier-ignore */ if (firstLineLogs) console.log(`Collector: getTxReceiptDetails call for txHash: ${txHash}`)
    try {
      const apiQuery = `${this.baseUrl}/api/transaction?txHash=${txHash}`
      const response = await axios.get(apiQuery).then((response) => {
        if (!response) {
          throw new Error('Failed to fetch transaction')
        } else return response
      })
      /* prettier-ignore */ if (verbose) console.log(`Collector: getTxReceiptDetails /api/transaction response: ${JSON.stringify(response.data)}`)

      const txId = response.data.transactions[0].txId
      const receiptQuery = `${this.baseUrl}/api/receipt?txId=${txId}`
      const receipt = await axios.get(receiptQuery).then((response) => response.data.receipts)
      return receipt
    } catch (error) {
      nestedCountersInstance.countEvent('collector', 'getTxReceiptDetails-error')
      console.error('Collector: Error getting transaction receipt details', error)
      return null
    }
  }

  async getStorage(txHash: string): Promise<{ key: string; value: string }[] | null> {
    if (!CONFIG.collectorSourcing.enabled) return null
    nestedCountersInstance.countEvent('collector', 'getStorage')
    const receipt = await this.getTxReceiptDetails(txHash)
    if (!receipt) {
      return null
    }
    const beforeStates: any[] = receipt.beforeStateAccounts
    const storageRecords = beforeStates.map((account) => {
      return {
        key: `${account.data.key}`,
        value: bufferToHex(account.data.value.data),
      }
    })
    return storageRecords
  }

  async getLatestBlockNumber(): Promise<{
    success: boolean
    number: bigint
    hash: string
    timestamp: bigint
  } | null> {
    if (!CONFIG.collectorSourcing.enabled) return null
    nestedCountersInstance.countEvent('collector', 'getLatestBlockNumber')
    const requestConfig: AxiosRequestConfig = {
      method: 'get',
      url: `${this.baseUrl}/api/blocks?numberHex=latest`,
      headers: this.defaultHeaders,
    }

    /* prettier-ignore */ if (firstLineLogs) console.log(`Collector: getLatestBlockNumber call`)
    try {
      /* prettier-ignore */ if (verbose) console.log(`Collector: getLatestBlockNumber requestConfig: ${JSON.stringify(requestConfig)}`)
      const res = await axiosWithRetry<{
        success: boolean
        number: bigint
        hash: string
        timestamp: bigint
      }>(requestConfig)
      /* prettier-ignore */ if (verbose) console.log(`Collector: getLatestBlockNumber res: ${JSON.stringify(res.data)}`)
      if (!res.data.success) return null

      return res.data
    } catch (e) {
      nestedCountersInstance.countEvent('collector', 'getLatestBlockNumber-error')
      console.error('Collector: Error getting latest block number', e)
      return null
    }
  }

  async getTransactionByBlock(request: TxByBlockRequest): Promise<number | any | null> {
    if (!CONFIG.collectorSourcing.enabled) return null

    /* prettier-ignore */ if (firstLineLogs) console.log(`Collector: getTransactionByBlock call -> ${JSON.stringify(request)}`)
    let url = `${this.baseUrl}/api/transaction?`
    if (request.blockNumber) {
      url += `blockNumber=${request.blockNumber}`
    }
    if (request.blockHash) {
      url += `blockHash=${request.blockHash}`
    }
    url += `&countOnly=${request.countOnly}`
    const requestConfig: AxiosRequestConfig = {
      method: 'get',
      url: url,
      headers: this.defaultHeaders,
    }

    try {
      /* prettier-ignore */ if (verbose) console.log(`Collector: getTransactionByBlock requestConfig: ${JSON.stringify(requestConfig)}`)
      const res = await axiosWithRetry<{ success: boolean; totalTransactions?: number; transactions: any }>(
        requestConfig
      )
      /* prettier-ignore */ if (verbose) console.log(`Collector: getTransactionByBlock res: ${JSON.stringify(res.data)}`)
      if (!res.data.success) return null

      let result: number | any
      if (request.countOnly) {
        result = res.data.totalTransactions
      } else result = res.data.transactions

      /* prettier-ignore */ if (verbose) console.log(`Collector: getTransactionByBlock result: ${JSON.stringify(result)}`)
      return result
    } catch (error) {
      console.error('Collector: Error getting transaction by block', error)
      return null
    }
  }


  async getBlock(
    blockSearchValue: string,
    blockSearchType: 'hex_num' | 'hash' | 'tag',
    details = false
  ): Promise<readableBlock | null> {

    const request_key = `${blockSearchValue} ${blockSearchType}` //this should be enough?
    // pendingRequests
    if(this.pendingRequests.has(request_key)){
      while(this.pendingRequests.has(request_key)){
        await sleep(200)
      }
    } else {
      try{
        this.pendingRequests.add(request_key)
        nestedCountersInstance.countEvent('getBlock', 'first')
        return await this.inner_getBlock(blockSearchValue, blockSearchType, details)
      } finally {
        this.pendingRequests.delete(request_key)
      }
    }
    nestedCountersInstance.countEvent('getBlock', 'waited')
    return await this.inner_getBlock(blockSearchValue, blockSearchType, details)
  }

  async inner_getBlock(
    blockSearchValue: string,
    blockSearchType: 'hex_num' | 'hash' | 'tag',
    details = false
  ): Promise<readableBlock | null> {
    if (!CONFIG.collectorSourcing.enabled) return null
    nestedCountersInstance.countEvent('collector', 'getBlock')
    /* prettier-ignore */ if (firstLineLogs) console.log(`Collector: getBlock call for block: ${blockSearchValue}`)


    nestedCountersInstance.countEvent('blockcache', `details ${details}`)
    //Need to to not create the cache key here.  Instead we can search cache by block number, hash, or by 'earliest'

    if (blockSearchValue !== 'latest') {
      //instead of look up by key we need to give the inp type and block 
      const cachedBlock = this.blockCacheManager.get(blockSearchValue, blockSearchType)

      //should we retry for tranactions if there are not any??
      if (cachedBlock) {
        return cachedBlock
      }
    }
    try {
      let blockQuery
      //Note:  the latest / earlier tags actually get passed through numberHex or hash and the collector api will sort that out
      //       it seems that if tag is used that will also look up by hash which is fine based on how the collector handles this endpoint
      if (blockSearchType === 'hex_num') {
        // int to hex
        blockQuery = `${this.baseUrl}/api/blocks?numberHex=${blockSearchValue}`
      } else {
        blockQuery = `${this.baseUrl}/api/blocks?hash=${blockSearchValue}`
      }
      /* prettier-ignore */ if (verbose) console.log(`Collector: getBlock blockQuery: ${blockQuery}`)

      const response = await axios.get(blockQuery).then((response) => response.data)
      if (!response.success) return null

      const { readableBlock, number } = response
      const blockNumber = number
      const resultBlock = readableBlock


      // if blockSearchValue is latest we still had to look it up above, but once we have the 
      // block we can see if we have a niced cached version of it that will have all of the transactions 
      if (blockSearchValue === 'latest' && resultBlock != null) {
        //look it up by hash 
        let cachedBlock = this.blockCacheManager.get(resultBlock.hash, 'hash')
        if (cachedBlock) {
          nestedCountersInstance.countEvent('blockcache', `hit latest`)
          return cachedBlock
        } else {
          nestedCountersInstance.countEvent('blockcache', `miss latest`)
        }
      }

      const txQuery = `${this.baseUrl}/api/transaction?blockNumber=${blockNumber}`

      resultBlock.transactions = await axios
        .get(txQuery)
        .then((response) => {
          if (!response.data.success) return []
          return response.data.transactions.map((tx: any) => {
            //need to review the safety of this for caching and support that this could change!
            if (details === true) {
              return this.decodeTransaction(tx)
            }
            return tx.wrappedEVMAccount.readableReceipt.transactionHash
          })
        })
        .catch((e) => {
          nestedCountersInstance.countEvent('collector', 'getBlock-error')
          console.error('collector.getBlock could not get txs for the block', e)
          return []
        })

      this.blockCacheManager.update(blockSearchValue, blockSearchType, resultBlock)

        
      return resultBlock
    } catch (e) {
      nestedCountersInstance.countEvent('collector', 'getBlock-error')
      console.error('An error occurred for Collector.getBlock:', e)
      return null
    }
  }

  async fetchTxHistory(key: string, timestamp: number): Promise<{ accountId: any; data: any } | null> {
    if (!CONFIG.collectorSourcing.enabled) {
      return null
    }

    try {
      /* prettier-ignore */ if (firstLineLogs) console.log(`Collector: fetchAccount call for key: ${key}`)
      nestedCountersInstance.countEvent('collector', 'fetchTxHistory')
      const accountKey = `0x${key.slice(0, -24)}`
      const apiQuery = `${this.baseUrl}/api/transaction?address=${accountKey}&beforeTimestamp=${timestamp}`

      const txCount = await axios.get(apiQuery).then((response) => response.data.totalTransactions)
      if (txCount === 0) {
        console.log(`Collector: fetchAccount account does not exist for key: ${key}`)
        return null
      }

      const numberOfPages = Math.ceil(txCount / 10)
      for (let i = 1; i <= numberOfPages; i++) {
        const txList = await axios
          .get(apiQuery.concat(`&page=${i}`))
          .then((response) => response.data.transactions)
          .then((txList) =>
            txList.map((tx: { txId: string; timestamp: number }) => {
              return { txId: tx.txId, timestamp: tx.timestamp }
            })
          )

        for (const tx of txList) {
          const foundAccount = await axios
            .get(`${this.baseUrl}/api/receipt?txId=${tx.txId}`)
            .then((response) => response.data.receipts.accounts)
            .then((accounts) => {
              return accounts.find((account: { accountId: string }) => account.accountId === key)
            })

          if (foundAccount) {
            return {
              accountId: foundAccount.accountId,
              data: foundAccount.data,
            }
          }
        }
      }

      return null
    } catch (error) {
      nestedCountersInstance.countEvent('collector', 'fetchTxHistory-error')
      console.error('Collector: Error in fetchTxHistory', error)
      return null
    }
  }

  async fetchAccount(accountId: string): Promise<any | null> {
    try {
      nestedCountersInstance.countEvent('collector', 'fetchAccount')
      const apiQuery = `${this.baseUrl}/api/account?accountId=${accountId}`
      const response = await axios.get(apiQuery).then((response) => {
        if (!response) {
          nestedCountersInstance.countEvent('collector', 'fetchAccount-error')
          throw new Error('Failed to fetch transaction')
        }
        return response
      })
      return response
    } catch (error) {
      nestedCountersInstance.countEvent('collector', 'fetchAccount-error')
      console.error('Collector: Error in fetchAccount', error)
      return null
    }
  }

  buildLogAPIUrl(request: any, baseDomain = CONFIG.explorerUrl): string {
    const apiUrl = `${baseDomain}/api/v2/logs`
    const queryParams: string[] = []

    // Check if each query parameter exists in the request object and add it to the queryParams array if it does
    if (typeof request.address === 'string') {
      queryParams.push(`address=${request.address}`)
    }
    if (Array.isArray(request.address)) {
      queryParams.push(`address=${JSON.stringify(request.address)}`)
    }
    if (request.topics && request.topics.length > 0) {
      queryParams.push(`topics=${JSON.stringify(request.topics)}`)
    }
    if (request.fromBlock) {
      queryParams.push(`fromBlock=${request.fromBlock}`)
    }
    if (request.toBlock) {
      queryParams.push(`toBlock=${request.toBlock}`)
    }
    if (request.blockHash) {
      queryParams.push(`blockHash=${request.blockHash}`)
    }
    // Combine the base URL with the query parameters
    return `${apiUrl}${queryParams.length > 0 ? `?${queryParams.join('&')}` : ''}`
  }

  decodeTransaction(tx: any): readableTransaction {
    const readableReceipt = tx.wrappedEVMAccount.readableReceipt
    nestedCountersInstance.countEvent('collector', 'decodeTransaction')
    let result: any = null
    let txObj = null

    try {
      const raw = tx.originalTxData.tx.raw as string
      txObj = TransactionFactory.fromSerializedData(toBuffer(raw))
    } catch (e) {
      // fallback to collectors readable receipt
      // v, r, s are not available in readableReceipt
      return {
        hash: readableReceipt.transactionHash,
        blockHash: readableReceipt.blockHash,
        blockNumber: readableReceipt.blockNumber,
        type: '0x0',
        nonce: readableReceipt.nonce,
        to: readableReceipt.to,
        from: readableReceipt.from,
        gas: readableReceipt.gasUsed,
        value: readableReceipt.value,
        input: readableReceipt.input,
        gasPrice: readableReceipt.gasPrice,
        chainId: '0x' + CONFIG.chainId.toString(16),
        transactionIndex: readableReceipt.transactionIndex,
        v: '0x',
        r: '0x',
        s: '0x',
      } as readableLegacyTransaction
    }

    if (CONFIG.verbose) console.log(txObj)
    // Legacy Transaction
    result = {
      hash: readableReceipt.transactionHash,
      blockHash: readableReceipt.blockHash,
      blockNumber: readableReceipt.blockNumber,
      type: '0x' + txObj.type.toString(16), // <--- legacy tx is type 0
      nonce: '0x' + txObj.nonce.toString(16),
      to: txObj?.to?.toString(),
      from: txObj.getSenderAddress().toString(),
      gas: '0x' + txObj.gasLimit.toString(16),
      value: '0x' + txObj.value.toString('hex'),
      input: '0x' + txObj.data.toString('hex'),
      gasPrice: '0x' + txObj.getBaseFee().toString(16),
      chainId: '0x' + CONFIG.chainId.toString(16),
      transactionIndex: readableReceipt.transactionIndex,
      v: '0x' + txObj.v?.toString('hex'),
      r: '0x' + txObj.r?.toString('hex'),
      s: '0x' + txObj.s?.toString('hex'),
    } as readableLegacyTransaction

    // EIP-2930 Transaction
    if (txObj?.type === 1) {
      //typecast so that we can access AccessListJSON
      txObj = txObj as AccessListEIP2930Transaction
      result.accessList = txObj.AccessListJSON // <--- this is difference
      result.type = '0x' + txObj.type.toString(16)
      result = result as readableEIP2930Transaction
    }

    // EIP-1559 Transaction
    if (txObj?.type === 2) {
      //typecast so that we can access AccessListJSON, maxPriorityFeePerGas, maxFeePerGas
      txObj = txObj as FeeMarketEIP1559Transaction
      result.type = '0x' + txObj.type.toString(16)
      result.maxPriorityFeePerGas = '0x' + txObj.maxPriorityFeePerGas.toString(16)
      result.maxFeePerGas = '0x' + txObj.maxFeePerGas.toString(16)
      result.accessList = txObj.AccessListJSON
      result = result as readableEIP1559Transaction
    }

    // EIP-4844 Transaction
    // if(txObj?.type === 3) {
    // seem to be very new and not supported by the version of @ethereum/tx yet
    // we locked the version to 3.4.0
    // have to update the dependency to support this
    // which is not a priority at the moment and possibly be backward incompatible
    // }
    return result as readableTransaction
  }
}

interface readableReceipt {
  blockHash: string
  blockNumber: string
  from: string
  gas: string
  gasPrice: string
  hash: string
  input: string
  nonce: string
  to: string
  transactionIndex: string
  value: string
  contractAddress: string
  transactionHash: string
  gasUsed: string
}

export interface completeReadableReceipt extends readableReceipt {
  cumulativeGasUsed: string
  data: string
  gasRefund: string
  logs: any[]
  logsBloom: string
  status: string
}

export type readableBlock = {
  difficulty: string
  extraData: string
  gasLimit: string
  gasUsed: string
  hash: string
  logsBloom: string
  miner: string
  mixHash: string
  nonce: string
  number: string
  parentHash: string
  receiptsRoot: string
  sha3Uncles: string
  size: string
  stateRoot: string
  timestamp: string
  totalDifficulty: string
  transactions: string[] | completeReadableReceipt[]
  transactionsRoot: string
  uncles: string[]
}

type readableLegacyTransaction = {
  hash: string
  blockHash: string
  blockNumber: string
  type: string
  nonce: string
  to: string
  from: string
  gas: string
  value: string
  input: string
  gasPrice: string
  chainId: string
  v: string
  r: string
  s: string
  transactionIndex: string
}

type readableEIP2930Transaction = readableLegacyTransaction & {
  accessList: AccessList[]
}

type readableEIP1559Transaction = readableEIP2930Transaction & {
  maxPriorityFeePerGas: string
  maxFeePerGas: string
}

export type readableTransaction =
  | readableLegacyTransaction
  | readableEIP2930Transaction
  | readableEIP1559Transaction

export const collectorAPI = new Collector(CONFIG.collectorSourcing.collectorApiServerUrl)
