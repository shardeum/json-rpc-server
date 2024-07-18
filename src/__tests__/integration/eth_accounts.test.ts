import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods - eth_accounts', () => {
    describe('eth_accounts', () => {
        it('should return an array of eth accounts', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_accounts',
                    params: []
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toBeInstanceOf(Array);
            expect(response.body.result).toContain('0x407d73d8a49eeb85d32cf465507dd71d507100c1');
        });

        it('should return an error if jsonrpc property is missing', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    id: 2,
                    method: 'eth_accounts',
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
                    method: 'eth_accounts',
                    params: []
                });

            expect(response.status).toBe(204);
        });

        it('should return a successful response if params property is missing', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 4,
                    method: 'eth_accounts'
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toBeInstanceOf(Array);
            expect(response.body.result).toContain('0x407d73d8a49eeb85d32cf465507dd71d507100c1');
        });

        it('should return a correct response if id property is of invalid type', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 'six', // id should be a number
                    method: 'eth_accounts',
                    params: []
                });

            expect(response.status).toBe(200);
            expect(response.body).toBeDefined();
            expect(response.body.jsonrpc).toBe('2.0');
            expect(response.body.id).toBe('six');
            expect(response.body.result).toBeInstanceOf(Array);
            expect(response.body.result).toContain('0x407d73d8a49eeb85d32cf465507dd71d507100c1');
        });
    });
});