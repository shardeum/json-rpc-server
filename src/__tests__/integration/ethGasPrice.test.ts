
import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {


    describe('eth_gasPrice', () => {
        it('should return gas price', async () => {
            let result = null;
            let error = null;

            const callback = (err: any, res: any) => {
                error = err;
                result = res;
            };

            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_gasPrice',
                    params: [[], callback],
                });

            expect(response.statusCode).toBe(200);
            expect(response.body).toBeDefined();
            expect(response.body.result).toBe(result);
        });
    });
});
