import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods - eth_hashrate', () => {
    describe('eth_hashrate', () => {
        it('should return the hash rate', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_hashrate',
                    params: []
                });

            expect(response.statusCode).toBe(200);
            expect(response.body).toBeDefined();
            expect(response.body.jsonrpc).toBe('2.0');
            expect(response.body.id).toBe(1);
            expect(response.body.result).toMatch(/^0x[0-9a-fA-F]+$/);
        });

        it('should return an error if jsonrpc property is missing', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    id: 2,
                    method: 'eth_hashrate',
                    params: []
                });

            expect(response.statusCode).toBe(200);
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
                    method: 'eth_hashrate',
                    params: []
                });

            expect(response.statusCode).toBe(204);
        });

        it('should return an error if method property is missing', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 3,
                    params: []
                });

            expect(response.statusCode).toBe(200);
            expect(response.body).toBeDefined();
            expect(response.body.jsonrpc).toBe('2.0');
            expect(response.body.id).toBe(null);
            expect(response.body.error).toBeDefined();
            expect(response.body.error.code).toBe(-32600);
            expect(response.body.error.message).toBe('Invalid request');
        });

        it('should return a successful response if params property is missing', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 4,
                    method: 'eth_hashrate'
                });

            expect(response.statusCode).toBe(200);
            expect(response.body).toBeDefined();
            expect(response.body.jsonrpc).toBe('2.0');
            expect(response.body.id).toBe(4);
            expect(response.body.error).toBeUndefined();
            expect(response.body.result).toMatch(/^0x[0-9a-fA-F]+$/);
        });

        it('should return an error if jsonrpc version is invalid', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: 'invalid_version',
                    id: 5,
                    method: 'eth_hashrate',
                    params: []
                });

            expect(response.statusCode).toBe(200);
            expect(response.body).toBeDefined();
            expect(response.body.jsonrpc).toBe('2.0');
            expect(response.body.id).toBe(null);
            expect(response.body.error).toBeDefined();
            expect(response.body.error.code).toBe(-32600);
            expect(response.body.error.message).toBe('Invalid request');
        });
        it('should return an error if jsonrpc version is invalid type', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: 2.0, // jsonrpc should be a string
                    id: 5,
                    method: 'eth_hashrate',
                    params: []
                });

            expect(response.statusCode).toBe(200);
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
                    id: 'six', // id should be a number
                    method: 'eth_hashrate',
                    params: []
                });

            expect(response.statusCode).toBe(200);
            expect(response.body).toBeDefined();
            expect(response.body.jsonrpc).toBe('2.0');
            expect(response.body.id).toBe('six');
            expect(response.body.result).toMatch(/^0x[0-9a-fA-F]+$/); // Matches any hex string
        });

        it('should return an error if params property is of invalid type', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 8,
                    method: 'eth_hashrate',
                    params: 'invalid_params' // params should be an array
                });

            expect(response.statusCode).toBe(200);
            expect(response.body).toBeDefined();
            expect(response.body.jsonrpc).toBe('2.0');
            expect(response.body.id).toBe(null);
            expect(response.body.error).toBeDefined();
            expect(response.body.error.code).toBe(-32600);
            expect(response.body.error.message).toBe('Invalid request');
        });
    });
});