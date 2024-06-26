import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_estimateGas', () => {
        it('should return the estimated gas', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send(
                    {
                        method: "eth_estimateGas",
                        params: [
                            {
                                to: "0x8469448199bdc8d5956a61643baadbf3e6930fec"
                            }
                        ],
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
