import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods - eth_getFilterLogs', () => {
    describe('eth_getFilterLogs', () => {
        it('should return logs for the given filter ID', async () => {
            // Step 1: Create a filter to get its ID
            const filterResponse = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_newFilter",
                    params: [{
                        fromBlock: "0x1",
                        toBlock: "latest",
                        address: "0x8469448199bdc8d5956a61643baadbf3e6930fec",
                        topics: []
                    }],
                    id: 1,
                    jsonrpc: "2.0"
                });

            expect(filterResponse.status).toBe(200);
            expect(filterResponse.body.result).toBeDefined();
            const filterId = filterResponse.body.result;

            // Step 2: Use the filter ID to get logs
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getFilterLogs",
                    params: [filterId],
                    id: 1,
                    jsonrpc: "2.0"
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toBeInstanceOf(Array); // Should return an array of logs
        });

        it('should return no logs if there are no matching logs', async () => {
            const filterResponse = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_newFilter",
                    params: [{
                        fromBlock: "0x1",
                        toBlock: "latest",
                        address: "0x0000000000000000000000000000000000000000", // Address with no logs
                        topics: []
                    }],
                    id: 4,
                    jsonrpc: "2.0"
                });

            expect(filterResponse.status).toBe(200);
            expect(filterResponse.body.result).toBeDefined();
            const filterId = filterResponse.body.result;

            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getFilterLogs",
                    params: [filterId],
                    id: 5,
                    jsonrpc: "2.0"
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toBeInstanceOf(Array); // Should return an array of logs
            expect(response.body.result.length).toBe(0); // No logs should be returned
        });
    });
});
