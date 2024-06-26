import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getCompilers', () => {
        it('should return the list of available compilers', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getCompilers",
                    params: [],
                    id: 1,
                    jsonrpc: "2.0"
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toBeInstanceOf(Array); // Ensure result is an array of compiler names

            // Add additional checks based on expected compiler names or count if needed
            // Example: expect(response.body.result).toContain('solidity');
        });
    });
});
