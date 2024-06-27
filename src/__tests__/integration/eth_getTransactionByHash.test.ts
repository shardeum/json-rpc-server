import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getTransactionByHash', () => {
        it('should return the transaction details by hash', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getTransactionByHash",
                    // Add your own parameters here
                    params: [
                        "0xf862e2b73ea9c7721fdf22307c2328300690d0e68e40212340360490ab5a0d39"
                    ],
                    id: 1,
                    jsonrpc: "2.0"
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            // Check that the transaction hash matches the provided hash
            expect(response.body.result).toHaveProperty('hash', "0xf862e2b73ea9c7721fdf22307c2328300690d0e68e40212340360490ab5a0d39");
            // Add additional checks for the transaction details if necessary
            expect(response.body.result).toHaveProperty('from'); // Check that the 'from' address is present
            expect(response.body.result).toHaveProperty('to');   // Check that the 'to' address is present
            expect(response.body.result).toHaveProperty('value'); // Check that the 'value' is present
        });
    });
});
