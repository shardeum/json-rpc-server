import request from 'supertest';
import { extendedServer } from '../../server';

describe('POST /api/method eth_signTransaction', () => {
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
        expect(response.body.result).toBe('0xa3f20717a250c2b0b729b7e5becbff67fdaef7e0699da4de7ca5895b02a170a12d887fd3b17bfdce3481f10bea41f45ba9f709d39ce8325427b57afcfc994cee1b');
    });
});
