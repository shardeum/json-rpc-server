import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getFilterChanges', () => {
        it('should return changes for the given filter ID', async () => {
            // First, create a new filter to get a filter ID
            const newFilterResponse = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_newFilter",
                    params: [{}], // No specific parameters, using default behavior
                    id: 1,
                    jsonrpc: "2.0"
                });

            const filterId = newFilterResponse.body.result;
            
            // Now get filter changes using the filter ID
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getFilterChanges",
                    params: [filterId],
                    id: 2,
                    jsonrpc: "2.0"
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toBeInstanceOf(Array); // Should return an array of changes
        });
    });
});
