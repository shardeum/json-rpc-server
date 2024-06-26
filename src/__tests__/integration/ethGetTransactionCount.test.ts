import request from 'supertest';
import { extendedServer } from '../../server';

describe('POST / eth_getTransactionCount', () => {
    it('should return the transaction count for a given address at the latest block', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                method: 'eth_getTransactionCount',
                params: ['0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698', 'latest'],
                id: 1,
            });
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('result');
        expect(response.body.result).toMatch(/^0x[0-9a-fA-F]+$/);
    });

    it('should return zero if the address has no transactions', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                method: 'eth_getTransactionCount',
                params: ['0x5f752C078d8fE70d77C644F05f3e29d9F073776c', 'latest'],
                id: 2,
            });
        expect(response.status).toBe(200);
        expect(response.body.result).toBe('0x0');
    });

    it('should return an error if jsonrpc property is missing', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                method: 'eth_getTransactionCount',
                params: ['0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698', 'latest'],
                id: 3,
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
                method: 'eth_getTransactionCount',
                params: ['0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698', 'latest']
            });
        expect(response.status).toBe(204);
    });

    it('should return an error if method property is missing', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                id: 4,
                params: ['0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698', 'latest']
            });
        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(null);
        expect(response.body.error).toBeDefined();
        expect(response.body.error.code).toBe(-32600);
        expect(response.body.error.message).toBe('Invalid request');
    });

    it('should return an error if params property is missing', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                id: 5,
                method: 'eth_getTransactionCount'
            });
        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(5);
        expect(response.body.error).toBeDefined();
        expect(response.body.error.code).toBe(-32602);
        expect(response.body.error.message).toBe('Invalid params: non-array args');
    });

    it('should return an error if jsonrpc version is invalid', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: 'invalid_version',
                id: 6,
                method: 'eth_getTransactionCount',
                params: ['0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698', 'latest']
            });
        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(null);
        expect(response.body.error).toBeDefined();
        expect(response.body.error.code).toBe(-32600);
        expect(response.body.error.message).toBe('Invalid request');
    });

    it('should return a correct response if id property is of invalid type', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                id: 'one', // id should be a number
                method: 'eth_getTransactionCount',
                params: ['0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698', 'latest']
            });
        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe('one');
        expect(response.body.result).toMatch(/^0x[0-9a-fA-F]+$/);
    });

    it('should return an error if method property is of invalid type', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                id: 7,
                method: 123, // method should be a string
                params: ['0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698', 'latest']
            });
        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(null);
        expect(response.body.error).toBeDefined();
        expect(response.body.error.code).toBe(-32600);
        expect(response.body.error.message).toBe('Invalid request');
    });

    it('should return an error if params property is of invalid type', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                id: 8,
                method: 'eth_getTransactionCount',
                params: 'invalid_params' // params should be an array
            });
        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(null);
        expect(response.body.error).toBeDefined();
        expect(response.body.error.code).toBe(-32600);
        expect(response.body.error.message).toBe('Invalid request');
    });
});