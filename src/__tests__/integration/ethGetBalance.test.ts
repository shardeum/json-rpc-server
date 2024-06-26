import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getBalance', () => {
        it('should return the correct balance for a valid address', async () => {
            const address = '0x4a372F3F5cFa12Ce491106BDD82735764ea29D62';
            const response = await request(extendedServer)
                .post('/')
                .send(
                    {
                        method: "eth_getBalance",
                        params: [
                            address,
                            "latest"
                        ],
                        id: 1,
                        jsonrpc: "2.0"
                    }
                );

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toMatch(/^0x[0-9a-fA-F]+$/);
        });

        it('should return zero if the address has no transactions', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    method: 'eth_getTransactionCount',
                    params: ['0x0D0668F67Ed7Ce0ce7D7AD234020054E9d5995C2', 'latest'],
                    id: 4,
                });
            expect(response.status).toBe(200);
            expect(response.body.result).toBe('0x0');
        });
    });
});
