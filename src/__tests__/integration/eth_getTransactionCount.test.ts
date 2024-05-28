

import request from 'supertest';
import { extendedServer } from '../../server';

describe('POST / eth_getTransactionCount', () => {
    it('should return the transaction count for a given address at the latest block', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                method: 'eth_getTransactionCount',
                params: ['0xf1a66ee4db3bfec6a4233bd10e587dacdae985a6', 'latest'],
                id: 1,
            });
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('result');
        expect(response.body.result).toMatch(/0x[0-9a-fA-F]+/);
    });

    it('should return zero if the address has no transactions', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                method: 'eth_getTransactionCount',
                params: ['0x742d35Cc6634C0532925a3b844Bc454e4438f44e', 'latest'],
                id: 4,
            });
        expect(response.status).toBe(200);
        expect(response.body.result).toBe('0x0');
    });
});