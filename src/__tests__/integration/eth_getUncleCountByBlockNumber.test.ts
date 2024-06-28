import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods - eth_getUncleCountByBlockNumber', () => {
    let blockNumber: any;

    // Fetch the latest block number before running the tests
    beforeAll(async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_blockNumber',
                params: []
            });

        blockNumber = response.body.result;
    });

    it('should return the number of uncles for a valid block number', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_getUncleCountByBlockNumber',
                params: [blockNumber]
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
                method: 'eth_getUncleCountByBlockNumber',
                params: [blockNumber]
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
                method: 'eth_getUncleCountByBlockNumber',
                params: [blockNumber]
            });

        expect(response.status).toBe(204);
    });

});
