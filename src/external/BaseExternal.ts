import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'

export interface StringToStringMap {
  [key: string]: string
}

/**
 * Represents a base class for external API interactions.
 */
export class BaseExternal {
  baseUrl: string
  retries: number
  defaultHeaders: StringToStringMap

  /**
   * Creates an instance of BaseExternal.
   * @param baseUrl The base URL of the external API.
   * @param retries The number of retries to attempt when making a request. Default is 3.
   * @param defaultHeaders The default headers to be included in each request. Default is an empty object.
   */
  constructor(baseUrl: string, retries = 3, defaultHeaders: StringToStringMap = {}) {
    this.baseUrl = baseUrl
    this.retries = retries
    this.defaultHeaders = defaultHeaders
  }
}

/**
 * Makes an HTTP request using Axios with retry functionality.
 * @param config The Axios request configuration.
 * @param retries The number of retries to attempt when the request fails. Default is 3.
 * @param retryInterval The interval in milliseconds between retries. Default is 500ms.
 * @returns A promise that resolves to the Axios response.
 * @throws The error that occurred during the request, of type unknown.
 */
export async function axiosWithRetry<T>(
  config: AxiosRequestConfig,
  retries = 3,
  retryInterval = 500
): Promise<AxiosResponse<T>> {
  try {
    return await axios(config)
  } catch (error) {
    const axiosError = error as AxiosError

    if (retries > 0 && (!axiosError.response || axiosError.response?.status === 500)) {
      await new Promise((resolve) => setTimeout(resolve, retryInterval))
      return axiosWithRetry<T>(config, retries - 1, retryInterval)
    } else {
      throw error
    }
  }
}
