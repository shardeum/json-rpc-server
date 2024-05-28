

import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getBalance', () => {
        it('should return the correct balance for a valid address', async () => {
            const address = '0xf1a66ee4db3bfec6a4233bd10e587dacdae985a6';
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
            expect(response.body.result).toBe('0x0');
        });

        // it('should return zero if the address has no transactions', async () => {
        //     const response = await request(extendedServer)
        //         .post('/')
        //         .send({
        //             jsonrpc: '2.0',
        //             method: 'eth_getTransactionCount',
        //             params: ['0x742d35Cc6634C0532925a3b844Bc454e4438f44e', 'latest'],
        //             id: 4,
        //         });
        //     expect(response.status).toBe(200);
        //     expect(response.body.result).toBe('0x0');
        // });
    });
});

