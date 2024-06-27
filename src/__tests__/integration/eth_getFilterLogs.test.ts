import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getFilterLogs', () => {
        it('should return logs for the given filter ID', async () => {
            // First, create a new filter to get a filter ID
            const newFilterResponse = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_newFilter",
                    // Add your own parameters here
                    params: [{
                        fromBlock: "0x1",
                        toBlock: "latest",
                        address: "0x8469448199bdc8d5956a61643baadbf3e6930fec",
                        topics: []
                    }],
                    id: 1,
                    jsonrpc: "2.0"
                });

            const filterId = newFilterResponse.body.result;

            // Now get filter logs using the filter ID
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getFilterLogs",
                    params: [filterId],
                    id: 2,
                    jsonrpc: "2.0"
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toBeInstanceOf(Array); // Should return an array of logs
        });
    });
});
