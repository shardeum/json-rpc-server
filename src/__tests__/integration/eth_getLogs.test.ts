import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getLogs', () => {
        it('should return logs for the given filter options', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getLogs",
                    params: [{
                        fromBlock: "0x1",
                        toBlock: "latest",
                        address: "0x8469448199bdc8d5956a61643baadbf3e6930fec",
                        topics: []
                    }],
                    id: 1,
                    jsonrpc: "2.0"
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toBeInstanceOf(Array); // Should return an array of logs
        });
    });
});
