import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods - eth_chainId', () => {
    describe('eth_chainId', () => {
        it('should return the chain ID of the current network', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_chainId',
                    params: []
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
                    id: 2,
                    method: 'eth_chainId',
                    params: []
                });

            expect(response.status).toBe(200);
            const chainId = parseInt(response.body.result, 16);
            expect(chainId).toBeGreaterThan(0);
        });

        it('should return an error if jsonrpc property is missing', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    id: 3,
                    method: 'eth_chainId',
                    params: []
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
                    method: 'eth_chainId',
                    params: []
                });

            expect(response.status).toBe(204);
        });

        it('should not return an error if params property is missing', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 5,
                    method: 'eth_chainId'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('result');
            expect(response.body.result).toMatch(/0x[0-9a-fA-F]+/);
        });

        it('should return an error if jsonrpc version is invalid', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: 'invalid_version',
                    id: 6,
                    method: 'eth_chainId',
                    params: []
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
                    id: 'seven', // id should be a number
                    method: 'eth_chainId',
                    params: []
                });

            expect(response.status).toBe(200);
            expect(response.body).toBeDefined();
            expect(response.body.jsonrpc).toBe('2.0');
            expect(response.body.id).toBe('seven');
            expect(response.body.result).toMatch(/0x[0-9a-fA-F]+/);
        });

        it('should return an error if method property is of invalid type', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 8,
                    method: 123, // method should be a string
                    params: []
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
});