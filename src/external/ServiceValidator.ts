/* eslint-disable @typescript-eslint/no-explicit-any */
import { AxiosRequestConfig } from 'axios'
import { BaseExternal, axiosWithRetry } from './BaseExternal'
import { verbose } from '../api'
import { CONFIG } from '../config'

class ServiceValidator extends BaseExternal {
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

  async getAccount(address: string): Promise<any | null> {
    if (!CONFIG.serviceValidatorSourcing.enabled) return null

    /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: getAccount call for address: ${address}`)
    const requestConfig: AxiosRequestConfig = {
      method: 'get',
      url: `${this.baseUrl}/account/${address}`,
      headers: this.defaultHeaders,
    }
    /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: getAccount requestConfig: ${JSON.stringify(requestConfig)}`)
    try {
      const res = await axiosWithRetry<{ account: any }>(requestConfig)
      /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: getAccount res: ${JSON.stringify(res.data)}`)
      return res.data.account
    } catch (e) {
      console.error(`ServiceValidator: Error getting account`, e)
      return null
    }
  }

  async getBalance(address: string): Promise<string | null> {
    if (!CONFIG.serviceValidatorSourcing.enabled) return null

    /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: getBalance call for address: ${address}`)
    try {
      const account = await this.getAccount(address)
      if (!account) return '0x0'
      return account.balance
    } catch (e) {
      console.error(`ServiceValidator: Error getting balance`, e)
      return null
    }
  }

  async getTransactionCount(address: string): Promise<string | null> {
    if (!CONFIG.serviceValidatorSourcing.enabled) return null

    /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: getTransactionCount call for address: ${address}`)
    try {
      const account = await this.getAccount(address)
      if (!account) return '0x0'
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

  async ethCall(callObj: any): Promise<string | null> {
    if (!CONFIG.serviceValidatorSourcing.enabled) return null

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
      return null
    }
  }
}

export const serviceValidator = new ServiceValidator(CONFIG.serviceValidatorSourcing.serviceValidatorUrl)
