import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_newPendingTransactionFilter', () => {
        it('should create a new pending transaction filter and return a filter ID', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_newPendingTransactionFilter",
                    // No specific parameters, using default behavior
                    params: [],
                    id: 1,
                    jsonrpc: "2.0"
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toMatch(/^0x[0-9a-fA-F]+$/); // Check if it is a valid filter ID
        });
    });
});
