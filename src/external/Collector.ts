/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosRequestConfig } from 'axios'
import { bufferToHex } from 'ethereumjs-util'
import { verbose } from '../api'
import { CONFIG } from '../config'
import { LogQueryRequest } from '../types'
import { BaseExternal, axiosWithRetry } from './BaseExternal'

class Collector extends BaseExternal {
  constructor(baseURL: string) {
    super(baseURL, 3, {
      'Content-Type': 'application/json',
    })
  }

  async getLogsByFilter(request: LogQueryRequest): Promise<any[] | null> {
    if (!CONFIG.collectorSourcing.enabled) return null

    /* prettier-ignore */ console.log(`Collector: getLogsByFilter call for request: ${JSON.stringify(request)}`)
    try {
      const url = this.buildLogAPIUrl(request, this.baseUrl)
      /* prettier-ignore */ if (verbose) console.log(`Collector: getLogsByFilter built log API URL: ${url}`)

      const res = await axios.get(url)

      if (!res.data.success) return null

      const logs = res.data.logs.map((el: any) => el.log)
      return logs
    } catch (e) {
      console.error('An error occurred for Collector.getLogsByFilter:', e)
      return null
    }
  }

  async getTransactionByHash(txHash: string): Promise<readableReceipt | null> {
    if (!CONFIG.collectorSourcing.enabled) return null

    /* prettier-ignore */ console.log(`Collector: getTransactionByHash call for txHash: ${txHash}`)
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

      const result = res.data.transactions
        ? res.data.transactions[0]
          ? res.data.transactions[0].wrappedEVMAccount.readableReceipt
          : null
        : null

      /* prettier-ignore */ if (verbose) console.log(`Collector: getTransactionByHash result: ${JSON.stringify(result)}`)
      return result
    } catch (error) {
      console.error('Collector: Error getting transaction by hash', error)
      return null
    }
  }

  async getTransactionReceipt(txHash: string): Promise<completeReadableReceipt | null> {
    if (!CONFIG.collectorSourcing.enabled) return null

    /* prettier-ignore */ console.log(`Collector: getTransactionReceipt call for txHash: ${txHash}`)
    const requestConfig: AxiosRequestConfig = {
      method: 'get',
      url: `${this.baseUrl}/api/transaction?txHash=${txHash}`,
      headers: this.defaultHeaders,
    }
    try {
      const res = await axiosWithRetry<{ success: boolean; transactions: any }>(requestConfig)
      /* prettier-ignore */ if (verbose) console.log(`Collector: getTransactionReceipt res: ${JSON.stringify(res.data)}`)
      if (!res.data.success) return null

      const result = res.data.transactions
        ? res.data.transactions[0]
          ? res.data.transactions[0].wrappedEVMAccount.readableReceipt
          : null
        : null

      /* prettier-ignore */ if (verbose) console.log(`Collector: getTransactionReceipt result: ${JSON.stringify(result)}`)
      return result
    } catch (error) {
      console.error('Collector: Error getting transaction receipt', error)
      return null
    }
  }

  async getTxReceiptDetails(txHash: string): Promise<any | null> {
    if (!CONFIG.collectorSourcing.enabled) return null

    /* prettier-ignore */ console.log(`Collector: getTxReceiptDetails call for txHash: ${txHash}`)
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
      console.error('Collector: Error getting transaction receipt details', error)
      return null
    }
  }

  async getStorage(txHash: string): Promise<{ key: string; value: string }[] | null> {
    if (!CONFIG.collectorSourcing.enabled) return null

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

  async getBlock(
    block: string,
    inpType: 'hex_num' | 'hash' | 'tag',
    details = false
  ): Promise<readableBlock | null> {
    if (!CONFIG.collectorSourcing.enabled) return null

    /* prettier-ignore */ console.log(`Collector: getBlock call for block: ${block}`)
    try {
      let blockQuery
      if (inpType === 'hex_num') {
        // int to hex
        blockQuery = `${this.baseUrl}/api/blocks?numberHex=${block}`
      } else {
        blockQuery = `${this.baseUrl}/api/blocks?hash=${block}`
      }
      /* prettier-ignore */ if (verbose) console.log(`Collector: getBlock blockQuery: ${blockQuery}`)

      const response = await axios.get(blockQuery).then((response) => response.data)
      if (!response.success) return null

      const { readableBlock, number } = response
      const blockNumber = number
      const resultBlock = readableBlock
      const txQuery = `${this.baseUrl}/api/transaction?blockNumber=${blockNumber}`

      resultBlock.transactions = await axios
        .get(txQuery)
        .then((response) => {
          if (!response.data.success) return []
          return response.data.transactions.map((tx: any) => {
            if (details === true) {
              const receipt = tx.wrappedEVMAccount.readableReceipt
              receipt.status = receipt.status === 1 ? '0x01' : '0x00'
              receipt.v = receipt.v ? receipt.v : '0x'
              receipt.r = receipt.r ? receipt.r : '0x'
              receipt.s = receipt.s ? receipt.s : '0x'
              return receipt
            }
            return tx.wrappedEVMAccount.readableReceipt.transactionHash
          })
        })
        .catch((e) => {
          console.error('collector.getBlock could not get txs for the block', e)
          return []
        })

      return resultBlock
    } catch (e) {
      console.error('An error occurred for Collector.getBlock:', e)
      return null
    }
  }

  async fetchAccount(key: string, timestamp: number): Promise<{ accountId: any; data: any } | null> {
    if (!CONFIG.collectorSourcing.enabled) return null

    /* prettier-ignore */ console.log(`Collector: fetchAccount call for key: ${key}`)
    const accountKey = `0x${key.slice(0, -24)}`
    const apiQuery = `${this.baseUrl}/api/transaction?address=${accountKey}&beforeTimestamp=${timestamp}`

    const txCount = await axios.get(apiQuery).then((response) => response.data.totalTransactions)
    if (txCount === 0) {
      // Account does not exist!
      /* prettier-ignore */ console.log(`Collector: fetchAccount account does not exist for key: ${key}`)
      return null
    }

    let i = 1
    const numberOfPages = Math.ceil(txCount / 10)
    for (i; i <= numberOfPages; i++) {
      // Fetch current page
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

interface completeReadableReceipt extends readableReceipt {
  cumulativeGasUsed: string
  data: string
  gasRefund: string
  logs: any[]
  logsBloom: string
  status: string
}

type readableBlock = {
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

export const collectorAPI = new Collector(CONFIG.collectorSourcing.collectorApiServerUrl)
