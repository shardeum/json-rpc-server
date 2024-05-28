

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
                params: ['0xCB65445D84D15F703813a2829bD1FD836942c9B7', 'latest'],
                id: 2,
            });
        expect(response.status).toBe(200);
        expect(response.body.result).toBe('0x0');
    });
});