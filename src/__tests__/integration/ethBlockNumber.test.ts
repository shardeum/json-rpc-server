import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_blockNumber', () => {
        it('should return the block number', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send(
                    {
                        method: "eth_blockNumber",
                        params: ["", "latest"],
                        id: 1,
                        jsonrpc: "2.0"
                    }
                );

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toMatch(/^0x[0-9a-fA-F]+$/);
        });
    });
});