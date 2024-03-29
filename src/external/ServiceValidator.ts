/* eslint-disable @typescript-eslint/no-explicit-any */
import { AxiosRequestConfig } from 'axios'
import { BaseExternal, axiosWithRetry } from './BaseExternal'
import { verbose } from '../api'
import { CONFIG } from '../config'

/**
 * Represents a service validator that interacts with an external service.
 * This class provides methods to perform various operations such as getting contract code,
 * getting account information, getting balance, getting transaction count, getting gas price,
 * estimating gas, getting access list, and calling a contract.
 */
class ServiceValidator extends BaseExternal {
  constructor(baseUrl: string) {
    super(baseUrl, 3, {
      'Content-Type': 'application/json',
    })
  }

  /**
   * Retrieves the contract code for a given address.
   * @param address - The address of the contract.
   * @returns A Promise that resolves to the contract code as a string. It returns null if the service validator sourcing is disabled or if there is an error.
   */
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

  /**
   * Retrieves the account information for the given address.
   * @param address The address of the account.
   * @returns A Promise that resolves to the account information. It returns null if the service validator sourcing is disabled or if an error occurs.
   */
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

  /**
   * Retrieves the balance for a given address.
   * @param address The address for which to retrieve the balance.
   * @returns A Promise that resolves to the balance as a string and 0 if the account doesn't exist. It returns null if the service validator sourcing is disabled or an error occurs.
   */
  async getBalance(address: string): Promise<string | null> {
    if (!CONFIG.serviceValidatorSourcing.enabled) return null

    /* prettier-ignore */ if (verbose) console.log(`ServiceValidator: getBalance call for address: ${address}`)
    try {
      const account = await this.getAccount(address)
      if (!account) return '0'
      return account.balance
    } catch (e) {
      console.error(`ServiceValidator: Error getting balance`, e)
      return null
    }
  }

  /**
   * Retrieves the transaction count for a given address.
   * @param address The address for which to retrieve the transaction count.
   * @returns A Promise that resolves to the transaction count as a string or 0 if the account doesn't exist. It returns null if the service validator sourcing is disabled or an error occurs.
   */
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

  /**
   * Retrieves the gas price from the service validator.
   * @returns A Promise that resolves to a string representing the gas price. It returns null if the service validator sourcing is disabled or if an error occurs.
   */
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

  /**
   * Estimates the gas required for a given call object.
   * @param callObj The call object for which to estimate the gas.
   * @returns A promise that resolves to the estimated gas as a string. It returns null if the service validator sourcing is disabled or if an error occurs.
   */
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

  /**
   * Retrieves the access list for a given call object.
   * @param callObj The call object.
   * @returns A promise that resolves to an array of access list items. It returns null if the service validator sourcing is disabled or if an error occurs.
   */
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

  /**
   * Calls the Ethereum contract with the provided call object.
   * @param callObj The call object containing the necessary parameters for the contract call.
   * @returns A Promise that resolves to a string representing the result of the contract call. It returns null if the service validator sourcing is disabled or if an error occurs.
   */
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
