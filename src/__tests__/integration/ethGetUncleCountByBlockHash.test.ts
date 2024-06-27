import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods - eth_getUncleCountByBlockHash', () => {
    let blockHash: any;

    // Fetch a block hash before running the tests
    beforeAll(async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_getBlockByNumber',
                params: ['latest', false]
            });

        blockHash = response.body.result.hash;
    });

    it('should return the number of uncles for a valid block hash', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_getUncleCountByBlockHash',
                params: [blockHash]
            });

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(1);
        expect(response.body.result).toMatch(/^0x[0-9a-fA-F]+$/);
    });

    it('should return an error if jsonrpc property is missing', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                id: 1,
                method: 'eth_getUncleCountByBlockHash',
                params: [blockHash]
            });

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(null);
        expect(response.body.error).toBeDefined();
        expect(response.body.error.code).toBe(-32600);
        expect(response.body.error.message).toBe('Invalid request');
    });

    it('should return no response if id property is missing', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                method: 'eth_getUncleCountByBlockHash',
                params: [blockHash]
            });

        expect(response.status).toBe(204);
    });
});
