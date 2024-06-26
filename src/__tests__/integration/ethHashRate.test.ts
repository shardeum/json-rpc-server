import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_hashrate', () => {
        it('should return the hashrate', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send(
                    {
                        method: "eth_hashrate",
                        params: ['', "latest"],
                        id: 1,
                        jsonrpc: "2.0"
                    }
                );

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toBe('0x38a');
        });
    });
});