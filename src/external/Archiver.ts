import { getNodeList, getNetworkAccount } from '../utils'

export class Archiver {
  /**
   * Gets a paginated list of nodes from the archiver
   */
  async getPaginatedNodeList(page: number, limit: number): Promise<any[]> {
    try {
      return getNodeList(page, limit)
    } catch (error) {
      console.error('Error fetching paginated node list:', error)
      throw error
    }
  }
  async getNetworkAccount(): Promise<any> {
    try {
      return getNetworkAccount()
    } catch (error) {
      console.error('Error fetching network account:', error)
      throw error
    }
  }
}

export const archiverAPI = new Archiver()
