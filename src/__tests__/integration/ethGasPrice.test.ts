import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_gasPrice', () => {
        it('should return gas price', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_gasPrice',
                    params: []
                });

            expect(response.statusCode).toBe(200);
            expect(response.body).toBeDefined();
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toMatch(/^0x[0-9a-fA-F]+$/);
        });
    });
});