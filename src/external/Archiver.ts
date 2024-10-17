import { getNodeList, getNetworkAccount } from '../utils';
import axios from 'axios';

export class Archiver {
  constructor() {}

  async getNodeList(page: number, limit: number): Promise<any[]> {
    try {
      return getNodeList(page, limit);
    } catch (error) {
      console.error('Error fetching node list:', error);
      throw error;
    }
  }
  async getNetworkAccount(): Promise<any> {
    try {
      return getNetworkAccount();
    } catch (error) {
      console.error('Error fetching network account:', error);
      throw error;
    }
  }
}

export const archiverAPI = new Archiver();