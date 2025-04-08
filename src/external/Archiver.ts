import { getNodeList, getNetworkAccount } from '../utils'
import logger from '../config/logger'

export class Archiver {
  /**
   * Gets a paginated list of nodes from the archiver
   */
  async getPaginatedNodeList(page: number, limit: number): Promise<any[]> {
    try {
      return getNodeList(page, limit)
    } catch (error) {
      logger.error('Error fetching paginated node list', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined })
      throw error
    }
  }
  async getNetworkAccount(): Promise<any> {
    try {
      return getNetworkAccount()
    } catch (error) {
      logger.error('Error fetching network account', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined })
      throw error
    }
  }
}

export const archiverAPI = new Archiver()
