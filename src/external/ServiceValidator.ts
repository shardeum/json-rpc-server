/* eslint-disable @typescript-eslint/no-explicit-any */
import { AxiosRequestConfig } from 'axios'
import { BaseExternal, axiosWithRetry } from './BaseExternal'
import { verbose } from '../api'
import { CONFIG } from '../config'
import { collectorAPI } from './Collector'
import { Err, NewErr, NewInternalErr } from './Err'

class ServiceValidator extends BaseExternal {
  cachedLatestBlock: { blockNumber: string; blockTimestamp: string; cachedAt: number } | null = null

  constructor(baseUrl: string) {
    super(baseUrl, 3, {
      'Content-Type': 'application/json',
    })
  }

  async getContractCode(address: string): Promise<string | null> {
    if (!CONFIG.serviceValidatorSourcing.enabled) return null

    /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: getContractCode call for address: ${address}`)
    const requestConfig: AxiosRequestConfig = {
      method: 'get',
      url: `${this.baseUrl}/eth_getCode?address=${address}`,
      headers: this.defaultHeaders,
    }
    /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: getContractCode requestConfig: ${JSON.stringify(requestConfig)}`)
    try {
      const res = await axiosWithRetry<{ contractCode: string }>(requestConfig)
      /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: getContractCode res: ${JSON.stringify(res.data)}`)
      return res.data.contractCode
    } catch (e) {
      console.error(`ServiceValidator: Error getting contract code`, e)
      return null
    }
  }

  async getAccount(address: string): Promise<any> {
    if (!CONFIG.serviceValidatorSourcing.enabled) return null
    if (verbose) console.log(`ServiceValidator: getAccount call for address: ${address}`)

    const requestConfig: AxiosRequestConfig = {
      method: 'get',
      url: `${this.baseUrl}/account/${address}`,
      headers: this.defaultHeaders,
    }
    if (verbose) console.log(`ServiceValidator: getAccount requestConfig: ${JSON.stringify(requestConfig)}`)

    try {
      const res = await axiosWithRetry<{ account?: any; error?: any }>(requestConfig)
      if (verbose) console.log(`ServiceValidator: getAccount response: ${JSON.stringify(res.data)}`)
      if (res.data.error) {
        console.error(`ServiceValidator: Error in response for address ${address}: ${res.data.error}`)
        throw new Error(res.data.error)
      }
      return res.data.account
    } catch (e) {
      console.error(`ServiceValidator: Error getting account for address ${address}`, e)
      throw new Error('Error getting account')
    }
  }

  async getBalance(address: string): Promise<string | null> {
    if (!CONFIG.serviceValidatorSourcing.enabled) return null
    if (verbose) console.log(`ServiceValidator: getBalance call for address: ${address}`)

    try {
      const account = await this.getAccount(address)
      return account?.balance ?? '0'
    } catch (e) {
      console.error(`ServiceValidator: Error getting balance for address ${address}`, e)
      throw new Error('Error getting balance')
    }
  }

  async getTransactionCount(address: string): Promise<string | null> {
    if (!CONFIG.serviceValidatorSourcing.enabled) return null

    /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: getTransactionCount call for address: ${address}`)
    try {
      const account = await this.getAccount(address)
      if (!account) return '0'
      return account.nonce
    } catch (e) {
      console.error(`ServiceValidator: Error getting transaction count`, e)
      return null
    }
  }

  async getGasPrice(): Promise<string | null> {
    if (!CONFIG.serviceValidatorSourcing.enabled) return null

    /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: getGasPrice call`)
    const requestConfig: AxiosRequestConfig = {
      method: 'get',
      url: `${this.baseUrl}/eth_gasPrice`,
      headers: this.defaultHeaders,
    }
    /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: getGasPrice requestConfig: ${JSON.stringify(requestConfig)}`)
    try {
      const res = await axiosWithRetry<{ result: string }>(requestConfig)
      /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: getGasPrice res: ${JSON.stringify(res.data)}`)
      return res.data.result
    } catch (e) {
      console.error(`ServiceValidator: Error getting gas price`, e)
      return null
    }
  }

  async estimateGas(callObj: any): Promise<string | null> {
    if (!CONFIG.serviceValidatorSourcing.enabled) return null

    /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: estimateGas call for callObj: ${JSON.stringify(callObj)}`)
    const requestConfig: AxiosRequestConfig = {
      method: 'post',
      url: `${this.baseUrl}/contract/estimateGas`,
      headers: this.defaultHeaders,
      data: callObj,
    }
    /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: estimateGas requestConfig: ${JSON.stringify(requestConfig)}`)
    try {
      const res = await axiosWithRetry<{ estimateGas: string }>(requestConfig)
      /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: estimateGas res: ${JSON.stringify(res.data)}`)
      return res.data.estimateGas
    } catch (e) {
      console.error(`ServiceValidator: Error estimating gas`, e)
      return null
    }
  }

  async getAccessList(callObj: any): Promise<any[] | null> {
    if (!CONFIG.serviceValidatorSourcing.enabled) return null

    /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: getAccessList call for callObj: ${JSON.stringify(callObj)}`)
    const requestConfig: AxiosRequestConfig = {
      method: 'post',
      url: `${this.baseUrl}/contract/accesslist`,
      headers: this.defaultHeaders,
      data: callObj,
    }
    /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: getAccessList requestConfig: ${JSON.stringify(requestConfig)}`)
    try {
      const res = await axiosWithRetry<{ accessList: any[] }>(requestConfig)
      /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: getAccessList res: ${JSON.stringify(res.data)}`)
      return res.data.accessList
    } catch (e) {
      console.error(`ServiceValidator: Error getting access list`, e)
      return null
    }
  }

  async ethCall(callObj: any): Promise<string | Err | null> {
    if (!CONFIG.serviceValidatorSourcing.enabled) return NewErr('ServiceValidator sourcing is not enabled')

    if (CONFIG.collectorSourcing.enabled) {
      if (this.cachedLatestBlock === null) {
        await this.updateCachedLatestBlock()
      } else if (this.cachedLatestBlock.cachedAt < Date.now() - 1000 * 12) {
        this.updateCachedLatestBlock()
      }

      if (this.cachedLatestBlock) {
        callObj.block = {
          number: this.cachedLatestBlock.blockNumber,
          timestamp: this.cachedLatestBlock.blockTimestamp,
        }
      }
    }

    /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: ethCall call for callObj: ${JSON.stringify(callObj)}`)
    const requestConfig: AxiosRequestConfig = {
      method: 'post',
      url: `${this.baseUrl}/contract/call`,
      headers: this.defaultHeaders,
      data: callObj,
    }
    /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: ethCall requestConfig: ${JSON.stringify(requestConfig)}`)
    try {
      const res = await axiosWithRetry<{ result: string }>(requestConfig)
      /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: ethCall res: ${JSON.stringify(res.data)}`)
      return res.data.result
    } catch (e) {
      console.error(`ServiceValidator: Error calling contract`, e)
      return NewInternalErr('ServiceValidator: Error calling contract')
    }
  }

  private async updateCachedLatestBlock(): Promise<void> {
    /* prettier-ignore */ if (verbose) console.log('ServiceValidator: updateCachedLatestBlock')
    const block = await collectorAPI.getLatestBlockNumber()
    if (block) {
      this.cachedLatestBlock = {
        blockNumber: '0x' + block.number.toString(16),
        blockTimestamp: '0x' + block.timestamp.toString(16),
        cachedAt: Date.now(),
      }
    }
  }
}

export const serviceValidator = new ServiceValidator(CONFIG.serviceValidatorSourcing.serviceValidatorUrl)
