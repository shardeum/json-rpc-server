import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods - eth_signTransaction', () => {
    it('should sign a transaction and return the signed data', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                method: 'eth_signTransaction',
                params: [
                    {
                        from: '0xa4c0aadcce9c04fe8b833279b0198d4ae29d76a7',
                        to: '0x510e84aa16ab92752451a2763352681624c75ebe',
                        gas: '0x76c0',
                        gasPrice: '0x9184e72a000',
                        value: '0x9184e72a',
                        data: '0x0',
                    },
                ],
                id: 1,
            });
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('result');
        expect(response.body.result).toMatch(/^0x[0-9a-fA-F]+$/);
    });
    it('should return no response if id property is missing', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                method: 'eth_signTransaction',
                params: [
                    {
                        from: '0xa4c0aadcce9c04fe8b833279b0198d4ae29d76a7',
                        to: '0x510e84aa16ab92752451a2763352681624c75ebe',
                        gas: '0x76c0',
                        gasPrice: '0x9184e72a000',
                        value: '0x9184e72a',
                        data: '0x0',
                    },
                ]
            });

        expect(response.status).toBe(204);
    });
    it('should return an error if jsonrpc property is missing', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                id: 2,
                method: 'eth_signTransaction',
                params: [
                    {
                        from: '0xa4c0aadcce9c04fe8b833279b0198d4ae29d76a7',
                        to: '0x510e84aa16ab92752451a2763352681624c75ebe',
                        gas: '0x76c0',
                        gasPrice: '0x9184e72a000',
                        value: '0x9184e72a',
                        data: '0x0',
                    },
                ]
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