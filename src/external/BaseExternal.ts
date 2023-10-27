import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'

export interface StringToStringMap {
  [key: string]: string
}

export class BaseExternal {
  baseUrl: string
  retries: number
  defaultHeaders: StringToStringMap

  constructor(baseUrl: string, retries = 3, defaultHeaders: StringToStringMap = {}) {
    this.baseUrl = baseUrl
    this.retries = retries
    this.defaultHeaders = defaultHeaders
  }
}

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
      throw error // Here, we're throwing the error of type unknown.
    }
  }
}
