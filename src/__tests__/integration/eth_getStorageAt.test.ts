import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods - eth_getStorageAt', () => {
    describe('eth_getStorageAt', () => {
        it('should return the storage value at a given position', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_getStorageAt',
                    params: [
                        '0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698',
                        '0x1',
                        'latest'
                    ]
                });

            expect(response.statusCode).toBe(200);
            expect(response.body).toBeDefined();
            expect(response.body.result).toBe('0x'); // Expected result for valid request
        });

        it('should return an error if the position parameter is omitted', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_getStorageAt',
                    params: [
                        '0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698',
                        'latest'
                    ]
                });

            expect(response.statusCode).toBe(200);
            expect(response.body).toBeDefined();
            expect(response.body.jsonrpc).toBe('2.0');
            expect(response.body.id).toBe(1);
            expect(response.body.error).toBeDefined();
            expect(response.body.error.code).toBe(-32000);
            expect(response.body.error.message).toBe('Invalid position');
        });

        it('should return an error if jsonrpc property is missing', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    id: 2,
                    method: 'eth_getStorageAt',
                    params: [
                        '0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698',
                        '0x1',
                        'latest'
                    ]
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
                    method: 'eth_getStorageAt',
                    params: [
                        '0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698',
                        '0x1',
                        'latest'
                    ]
                });

            expect(response.statusCode).toBe(204);
        });

        it('should return an error if params property is missing', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 4,
                    method: 'eth_getStorageAt'
                });

            expect(response.statusCode).toBe(200);
            expect(response.body).toBeDefined();
            expect(response.body.jsonrpc).toBe('2.0');
            expect(response.body.id).toBe(4);
            expect(response.body.error).toBeDefined();
            expect(response.body.error.code).toBe(-32602);
            expect(response.body.error.message).toBe('Invalid params: non-array args');
        });

    });
});