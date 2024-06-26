import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_accounts', () => {
        it('should return an array of eth accounts', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send(
                    {
                        method: "eth_accounts",
                        params: ["", "latest"],
                        id: 1,
                        jsonrpc: "2.0"
                    }
                );

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toContain('0x407d73d8a49eeb85d32cf465507dd71d507100c1');
        });
    });
});