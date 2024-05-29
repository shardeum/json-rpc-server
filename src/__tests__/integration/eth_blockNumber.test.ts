import request from 'supertest';
import { extendedServer } from '../../server';

describe('POST / eth_blockNumber', () => {
    it('should return the latest block number', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                method: 'eth_blockNumber',
                params: [],
                id: 1,
            });
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('result');
        expect(response.body.result).toMatch(/0x[0-9a-fA-F]+/);
    });

    it('should return a valid block number', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                method: 'eth_blockNumber',
                params: [],
                id: 2,
            });
        expect(response.status).toBe(200);
        const blockNumber = parseInt(response.body.result, 16);
        expect(blockNumber).toBeGreaterThan(0);
    });
});
