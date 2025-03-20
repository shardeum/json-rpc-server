import { buildGetTransactionByBlockNumberAndIndex } from '../../../src/eth-handlers/eth_getTransactionByBlockNumberAndIndex';
import axios from 'axios';
import { completeReadableReceipt } from '../../../src/external/Collector';
import { RequestParamsLike } from 'jayson';

// Mock dependencies
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock crypto for the ticket generation
jest.mock('crypto', () => ({
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnValue({
      digest: jest.fn().mockReturnValue('test-ticket-hash'),
    }),
  }),
}));

describe('eth_getTransactionByBlockNumberAndIndex handler', () => {
  // Common test values
  const blockNumber = '0x1234';
  const blockNumberTag = 'latest';
  const txIndex = '0x1';
  
  // Declare mocks
  let mockNestedCountersInstance: any;
  let mockEnsureArrayArgs: jest.Mock;
  let mockCountFailedResponse: jest.Mock;
  let mockLogEventEmitter: any;
  let mockCollectorAPI: any;
  let mockExtractTransactionObject: jest.Mock;
  let mockCountSuccessResponse: jest.Mock;
  let mockConfig: any;
  let mockCallback: jest.Mock;
  let eth_getTransactionByBlockNumberAndIndex: any;

  // Initialize all mocks before each test
  beforeEach(() => {
    // Create fresh mocks for all dependencies
    mockNestedCountersInstance = {
      countEvent: jest.fn(),
    };
    mockEnsureArrayArgs = jest.fn();
    mockCountFailedResponse = jest.fn();
    mockLogEventEmitter = {
      emit: jest.fn(),
    };
    mockCollectorAPI = {
      getBlock: jest.fn(),
    };
    mockExtractTransactionObject = jest.fn();
    mockCountSuccessResponse = jest.fn();
    mockConfig = {
      queryFromValidator: true,
      queryFromExplorer: true,
      explorerUrl: 'https://explorer.example.com'
    };
    mockCallback = jest.fn();

    // Reset axios mock
    mockedAxios.get.mockReset();

    // Build the handler function with fresh mocks
    eth_getTransactionByBlockNumberAndIndex = buildGetTransactionByBlockNumberAndIndex({
      nestedCountersInstance: mockNestedCountersInstance,
      ensureArrayArgs: mockEnsureArrayArgs,
      countFailedResponse: mockCountFailedResponse,
      logEventEmitter: mockLogEventEmitter,
      firstLineLogs: false,
      collectorAPI: mockCollectorAPI,
      extractTransactionObject: mockExtractTransactionObject,
      countSuccessResponse: mockCountSuccessResponse,
      config: mockConfig,
      verbose: false,
      errorBusy: { code: -32005, message: 'Server busy' },
    });
  });

  describe('Input validation', () => {
    beforeEach(() => {
      // Setup ensureArrayArgs to return false for this specific test group
      mockEnsureArrayArgs.mockReturnValue(false);
    });

    it('should reject non-array arguments', async () => {
      // Call the function with non-array args
      await eth_getTransactionByBlockNumberAndIndex({ invalid: true } as RequestParamsLike, mockCallback);
      
      // Verify behavior
      expect(mockNestedCountersInstance.countEvent).toHaveBeenCalledWith('endpoint', 'eth_getTransactionByBlockNumberAndIndex');
      expect(mockEnsureArrayArgs).toHaveBeenCalledWith({ invalid: true }, mockCallback);
      expect(mockCountFailedResponse).toHaveBeenCalledWith('eth_getTransactionByBlockNumberAndIndex', 'Invalid params: non-array args');
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('Collector API path', () => {
    beforeEach(() => {
      // Setup ensureArrayArgs to return true for this test group
      mockEnsureArrayArgs.mockReturnValue(true);
    });

    it('should return transaction from collector when available with hex block number', async () => {
      const mockTransaction: Partial<completeReadableReceipt> = {
        blockNumber: blockNumber,
        transactionIndex: '0x1',
      };
      
      // Mock the collectorAPI.getBlock response
      mockCollectorAPI.getBlock.mockResolvedValue({
        transactions: [mockTransaction, mockTransaction]
      });
      
      // Call the function
      await eth_getTransactionByBlockNumberAndIndex([blockNumber, txIndex], mockCallback);
      
      // Verify behavior
      expect(mockCollectorAPI.getBlock).toHaveBeenCalledWith(blockNumber, 'hex_num', true);
      expect(mockCallback).toHaveBeenCalledWith(null, mockTransaction);
      expect(mockCountSuccessResponse).toHaveBeenCalledWith('eth_getTransactionByBlockNumberAndIndex', 'success', 'collector');
    });

    it('should return transaction from collector when available with "latest" tag', async () => {
      const mockTransaction: Partial<completeReadableReceipt> = {
        blockNumber: '0x10',
        transactionIndex: '0x1',
      };
      
      // Mock the collectorAPI.getBlock response
      mockCollectorAPI.getBlock.mockResolvedValue({
        transactions: [mockTransaction, mockTransaction]
      });
      
      // Call the function
      await eth_getTransactionByBlockNumberAndIndex([blockNumberTag, txIndex], mockCallback);
      
      // Verify behavior
      expect(mockCollectorAPI.getBlock).toHaveBeenCalledWith(blockNumberTag, 'hex_num', true);
      expect(mockCallback).toHaveBeenCalledWith(null, mockTransaction);
      expect(mockCountSuccessResponse).toHaveBeenCalledWith('eth_getTransactionByBlockNumberAndIndex', 'success', 'collector');
    });

    it('should adjust transactionIndex to match the input index', async () => {
      const mockTransaction: Partial<completeReadableReceipt> = {
        blockNumber: blockNumber,
        transactionIndex: '0x0', // Intentionally different from input index
      };
      
      // Mock the collectorAPI.getBlock response
      mockCollectorAPI.getBlock.mockResolvedValue({
        transactions: [mockTransaction, mockTransaction]
      });
      
      // Call the function
      await eth_getTransactionByBlockNumberAndIndex([blockNumber, txIndex], mockCallback);
      
      // Verify behavior
      expect(mockCollectorAPI.getBlock).toHaveBeenCalledWith(blockNumber, 'hex_num', true);
      // The transaction object should be returned with transactionIndex adjusted
      expect(mockCallback).toHaveBeenCalledWith(null, {
        ...mockTransaction,
        transactionIndex: '0x1' // Should match the input index
      });
    });

    it('should handle exception from collector API', async () => {
      // Mock the collectorAPI.getBlock to throw an error
      mockCollectorAPI.getBlock.mockRejectedValue(new Error('Collector API error'));
      
      // Call the function
      await eth_getTransactionByBlockNumberAndIndex([blockNumber, txIndex], mockCallback);
      
      // Verify behavior
      expect(mockCollectorAPI.getBlock).toHaveBeenCalledWith(blockNumber, 'hex_num', true);
      expect(mockCallback).toHaveBeenCalledWith({ code: -32005, message: 'Server busy' });
      expect(mockCountFailedResponse).toHaveBeenCalledWith('eth_getTransactionByBlockNumberAndIndex', 'exception in collectorAPI.getBlock');
    });
  });

  describe('Explorer API path', () => {
    beforeEach(() => {
      // Setup ensureArrayArgs to return true for this test group
      mockEnsureArrayArgs.mockReturnValue(true);
      
      // Setup collector API to return empty results for the Explorer path tests
      mockCollectorAPI.getBlock.mockResolvedValue({
        transactions: []
      });
    });

    it('should fetch transaction from explorer when collector API has no result with hex block number', async () => {
      // Setup mock explorer response
      const mockExplorerResponse = {
        data: {
          success: true,
          transactions: [
            { id: 'tx1' },
            { id: 'tx2' }
          ]
        }
      };
      mockedAxios.get.mockResolvedValue(mockExplorerResponse);
      
      // Setup extractTransactionObject to return a mock transaction
      const mockExtractedTx = { hash: '0xabc', blockNumber };
      mockExtractTransactionObject.mockReturnValue(mockExtractedTx);
      
      // Call the function
      await eth_getTransactionByBlockNumberAndIndex([blockNumber, txIndex], mockCallback);
      
      // Verify behavior
      // Should convert hex block number to decimal
      const decimalBlockNumber = parseInt(blockNumber, 16);
      expect(mockedAxios.get).toHaveBeenCalledWith(`${mockConfig.explorerUrl}/api/transaction?blockNumber=${decimalBlockNumber}`);
      expect(mockExtractTransactionObject).toHaveBeenCalledWith(mockExplorerResponse.data.transactions[1], 1);
      expect(mockCallback).toHaveBeenCalledWith(null, mockExtractedTx);
      expect(mockCountSuccessResponse).toHaveBeenCalledWith('eth_getTransactionByBlockNumberAndIndex', 'success', 'explorer');
    });

    it('should fetch transaction from explorer with "latest" block tag', async () => {
      // Setup mock explorer response
      const mockExplorerResponse = {
        data: {
          success: true,
          transactions: [
            { id: 'tx1' },
            { id: 'tx2' }
          ]
        }
      };
      mockedAxios.get.mockResolvedValue(mockExplorerResponse);
      
      // Setup extractTransactionObject to return a mock transaction
      const mockExtractedTx = { hash: '0xabc', blockNumber: 'latest' };
      mockExtractTransactionObject.mockReturnValue(mockExtractedTx);
      
      // Call the function
      await eth_getTransactionByBlockNumberAndIndex([blockNumberTag, txIndex], mockCallback);
      
      // Verify behavior
      expect(mockedAxios.get).toHaveBeenCalledWith(`${mockConfig.explorerUrl}/api/transaction?blockNumber=${blockNumberTag}`);
      expect(mockExtractTransactionObject).toHaveBeenCalledWith(mockExplorerResponse.data.transactions[1], 1);
      expect(mockCallback).toHaveBeenCalledWith(null, mockExtractedTx);
      expect(mockCountSuccessResponse).toHaveBeenCalledWith('eth_getTransactionByBlockNumberAndIndex', 'success', 'explorer');
    });

    it('should handle explorer API errors', async () => {
      // Setup mock explorer to throw an error
      mockedAxios.get.mockRejectedValue(new Error('Explorer API error'));
      
      // Call the function
      await eth_getTransactionByBlockNumberAndIndex([blockNumber, txIndex], mockCallback);
      
      // Verify behavior
      const decimalBlockNumber = parseInt(blockNumber, 16);
      expect(mockedAxios.get).toHaveBeenCalledWith(`${mockConfig.explorerUrl}/api/transaction?blockNumber=${decimalBlockNumber}`);
      expect(mockCallback).toHaveBeenCalledWith(null, null);
      expect(mockCountFailedResponse).toHaveBeenCalledWith('eth_getTransactionByBlockNumberAndIndex', 'exception in axios.get');
    });

    it('should handle invalid index gracefully', async () => {
      const outOfBoundsIndex = '0x5'; // Index that's out of bounds
      
      // Setup mock explorer response with fewer transactions than the index
      const mockExplorerResponse = {
        data: {
          success: true,
          transactions: [
            { id: 'tx1' },
            { id: 'tx2' }
          ]
        }
      };
      mockedAxios.get.mockResolvedValue(mockExplorerResponse);
      
      // Call the function
      await eth_getTransactionByBlockNumberAndIndex([blockNumber, outOfBoundsIndex], mockCallback);
      
      // Verify behavior
      const decimalBlockNumber = parseInt(blockNumber, 16);
      expect(mockedAxios.get).toHaveBeenCalledWith(`${mockConfig.explorerUrl}/api/transaction?blockNumber=${decimalBlockNumber}`);
      // extractTransactionObject shouldn't be called since index is invalid
      expect(mockExtractTransactionObject).not.toHaveBeenCalled();
      
      // The implementation calls callback twice:
      // First in the explorer path with null (no result)
      expect(mockCallback).toHaveBeenNthCalledWith(1, null, undefined);
      // Then again at the end of the function with the original result variable (still undefined)
      expect(mockCallback).toHaveBeenNthCalledWith(2, null, undefined);
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    it('should handle explorer unsuccessful response', async () => {
      // Setup mock explorer response with success: false
      const mockExplorerResponse = {
        data: {
          success: false,
          transactions: []
        }
      };
      mockedAxios.get.mockResolvedValue(mockExplorerResponse);
      
      // Call the function
      await eth_getTransactionByBlockNumberAndIndex([blockNumber, txIndex], mockCallback);
      
      // Verify behavior
      const decimalBlockNumber = parseInt(blockNumber, 16);
      expect(mockedAxios.get).toHaveBeenCalledWith(`${mockConfig.explorerUrl}/api/transaction?blockNumber=${decimalBlockNumber}`);
      
      // The implementation calls callback twice:
      // First in the explorer path with null (unsuccessful response)
      expect(mockCallback).toHaveBeenNthCalledWith(1, null, null);
      // Then again at the end of the function with the original result variable (undefined in the refactored test)
      expect(mockCallback).toHaveBeenNthCalledWith(2, null, undefined);
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    it('should handle "earliest" block tag correctly', async () => {
      // Setup mock explorer response
      const mockExplorerResponse = {
        data: {
          success: true,
          transactions: [
            { id: 'tx1' },
            { id: 'tx2' }
          ]
        }
      };
      mockedAxios.get.mockResolvedValue(mockExplorerResponse);
      
      // Setup extractTransactionObject to return a mock transaction
      const mockExtractedTx = { hash: '0xabc', blockNumber: '0x0' };
      mockExtractTransactionObject.mockReturnValue(mockExtractedTx);
      
      // Call the function with "earliest" tag
      await eth_getTransactionByBlockNumberAndIndex(['earliest', txIndex], mockCallback);
      
      // Verify behavior - should convert "earliest" to 0
      expect(mockedAxios.get).toHaveBeenCalledWith(`${mockConfig.explorerUrl}/api/transaction?blockNumber=0`);
      expect(mockExtractTransactionObject).toHaveBeenCalledWith(mockExplorerResponse.data.transactions[1], 1);
      expect(mockCallback).toHaveBeenCalledWith(null, mockExtractedTx);
    });
  });

  describe('Configuration state handling', () => {
    beforeEach(() => {
      // Setup ensureArrayArgs to return true for this test group
      mockEnsureArrayArgs.mockReturnValue(true);
      
      // Setup collector API to return null
      mockCollectorAPI.getBlock.mockResolvedValue({
        transactions: []
      });
    });

    it('should handle disabled queryFromExplorer', async () => {
      // Disable config option
      const disabledConfig = {
        ...mockConfig,
        queryFromExplorer: false
      };
      
      // Rebuild handler with disabled config
      const handlerWithDisabledConfig = buildGetTransactionByBlockNumberAndIndex({
        nestedCountersInstance: mockNestedCountersInstance,
        ensureArrayArgs: mockEnsureArrayArgs,
        countFailedResponse: mockCountFailedResponse,
        logEventEmitter: mockLogEventEmitter,
        firstLineLogs: false,
        collectorAPI: mockCollectorAPI,
        extractTransactionObject: mockExtractTransactionObject,
        countSuccessResponse: mockCountSuccessResponse,
        config: disabledConfig,
        verbose: false,
        errorBusy: { code: -32005, message: 'Server busy' },
      });
      
      // Call the function
      await handlerWithDisabledConfig([blockNumber, txIndex], mockCallback);
      
      // Verify behavior
      expect(mockCallback).toHaveBeenCalledWith(null, null);
      expect(mockCountFailedResponse).toHaveBeenCalledWith('eth_getTransactionByBlockNumberAndIndex', 'queryFromExplorer turned off');
    });
  });
}); 