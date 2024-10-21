import { Request, Response, NextFunction } from 'express';
import { methodWhitelist } from './methodWhitelist';

// Mock the '../api' module
jest.mock('../api', () => ({
  methods: {
    eth_getBalance: jest.fn(),
    eth_blockNumber: jest.fn(),
    eth_sendRawTransaction: jest.fn(),
  }
}));

describe('methodWhitelist middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction = jest.fn();

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();
  });

  it('should allow a single valid method', () => {
    mockRequest.body = { method: 'eth_getBalance' };
    methodWhitelist(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should allow all methods in a batch request', () => {
    mockRequest.body = [
      { method: 'eth_getBalance' },
      { method: 'eth_blockNumber' },
    ];
    methodWhitelist(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should reject a single invalid method', () => {
    mockRequest.body = { method: 'invalid_method' };
    methodWhitelist(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('should reject a batch request with one invalid method', () => {
    mockRequest.body = [
      { method: 'eth_getBalance' },
      { method: 'invalid_method' },
    ];
    methodWhitelist(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('should handle requests with no method', () => {
    mockRequest.body = {};
    methodWhitelist(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });
});
