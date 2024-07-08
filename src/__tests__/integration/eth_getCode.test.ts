import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods - eth_getCode', () => {
    const testAddress = '0x6d1f44b11eb29b8bcbb4f7e15be7e4ebdd0a9cc5';

    it('should return the code at the given address for the latest block', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_getCode',
                params: [testAddress, 'latest']
            });

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(1);
        expect(response.body.result).toMatch(/^0x[0-9a-fA-F]*$/);
    });

    it('should return an error if jsonrpc property is missing', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                id: 1,
                method: 'eth_getCode',
                params: [testAddress, 'latest']
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
                method: 'eth_getCode',
                params: [testAddress, 'latest']
            });

        expect(response.status).toBe(204);
    });
});
