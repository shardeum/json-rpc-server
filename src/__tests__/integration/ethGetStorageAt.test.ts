import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getStorageAt', () => {
        it('should return the storage value at a given position', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_getStorageAt',
                    params: [
                        '0xb6da4e0870f18247dafc9495652c394c3c8c60b8',
                        '0x0',
                        'latest'
                    ]
                });

            expect(response.statusCode).toBe(200);
            expect(response.body).toBeDefined();
            expect(response.body.result).toMatch(/^0x[0-9a-fA-F]*$/); // Matches any hex string
        });

    });
});