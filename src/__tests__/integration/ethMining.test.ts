import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_mining', () => {
        it('should return mining as true', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send(
                    {
                        method: "eth_mining",
                        params: ['', "latest"],
                        id: 1,
                        jsonrpc: "2.0"
                    }
                );

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toBe(true);
        });
    });
});