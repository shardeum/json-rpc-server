import request from 'supertest';
import { extendedServer } from '../../server';

describe('POST / eth_chainId', () => {
    it('should return the chain ID of the current network', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                method: 'eth_chainId',
                params: [],
                id: 1,
            });
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('result');
        expect(response.body.result).toMatch(/0x[0-9a-fA-F]+/);
    });

    it('should return a valid chain ID', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                method: 'eth_chainId',
                params: [],
                id: 2,
            });
        expect(response.status).toBe(200);
        const chainId = parseInt(response.body.result, 16);
        expect(chainId).toBeGreaterThan(0);
    });
});
