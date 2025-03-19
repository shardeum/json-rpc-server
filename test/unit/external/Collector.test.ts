import { TransactionFactory } from '@ethereumjs/tx'

// Mock the config module
jest.mock('../../../src/config', () => ({
  CONFIG: {
    chainId: 8082,
    verbose: false,
    collectorSourcing: {
      collectorApiServerUrl: 'http://test-url.com',
      enabled: true,
    },
    rateLimitOption: {
      allowedTxCountInCheckInterval: 100,
    },
    blockCacheSettings: {
      lastNBlocksSize: 10,
      lruMBlocksSize: 100,
    },
  },
}))

// Mock the api module
jest.mock('../../../src/api', () => ({
  verbose: false,
  firstLineLogs: false,
}))

// Mock the BlockCacheManager
jest.mock('../../../src/cache/BlockCacheManager', () => {
  return {
    BlockCacheManager: jest.fn().mockImplementation(() => {
      return {
        getBlock: jest.fn(),
        addBlock: jest.fn(),
      }
    }),
  }
})

// Mock the nestedCountersInstance
jest.mock('../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn().mockReturnValue({
    get: jest.fn(),
    post: jest.fn(),
  }),
}))

// Now import the collectorAPI after all mocks are set up
import { collectorAPI } from '../../../src/external/Collector'

describe('Collector', () => {
  describe('decodeTransaction', () => {
    it('should use receipt gasPrice instead of base fee for gasPrice field', () => {
      // Mock receipt gasPrice
      const receiptGasPrice = '0xabc123' // Different value than what base fee will return

      // Create a mock transaction object with the necessary data
      const mockTx = {
        wrappedEVMAccount: {
          readableReceipt: {
            transactionHash: '0x123',
            blockHash: '0x456',
            blockNumber: '0x789',
            nonce: '0x1',
            to: '0xabc',
            from: '0xdef',
            gasUsed: '0x5000',
            value: '0x0',
            input: '0x',
            gasPrice: receiptGasPrice,
            transactionIndex: '0x0',
          },
        },
        originalTxData: {
          tx: {
            raw: '0x02f8b00182053901830186a094d8da6bf26964af9d7eed9e03e53415d37aa96045880b844a9059cbb000000000000000000000000f5de760f2e916647fd766b4ad9e85ff943ce3a2b0000000000000000000000000000000000000000000000000000000000002710c080a0f1db1b9b6e3c677d6b3ebd3d1f6a3b8c4b3c3d3e3f3g3h3i3j3k3l3m3n3o3p3qa0f1db1b9b6e3c677d6b3ebd3d1f6a3b8c4b3c3d3e3f3g3h3i3j3k3l3m3n3o3p3q',
          },
        },
      }

      // Mock the TransactionFactory.fromSerializedData to return a mock transaction object
      const mockTxObj = {
        type: 0,
        nonce: BigInt(1),
        to: { toString: () => '0xabc' },
        getSenderAddress: () => ({ toString: () => '0xdef' }),
        gasLimit: BigInt(21000),
        value: Buffer.from('0', 'hex'),
        data: Buffer.from('', 'hex'),
        getBaseFee: () => BigInt(parseInt('def456', 16)), // Different from receiptGasPrice
        v: Buffer.from('1c', 'hex'),
        r: Buffer.from('123', 'hex'),
        s: Buffer.from('456', 'hex'),
      }

      jest.spyOn(TransactionFactory, 'fromSerializedData').mockReturnValue(mockTxObj as any)

      // Call the method with our mock transaction
      const result = collectorAPI.decodeTransaction(mockTx)

      // After our fix, the gasPrice should match the receipt's gasPrice, not the base fee
      expect(result.gasPrice).toBe(receiptGasPrice)
    })
  })
})
