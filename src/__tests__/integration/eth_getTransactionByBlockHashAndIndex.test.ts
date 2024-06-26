import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getTransactionByBlockHashAndIndex', () => {
        it('should return the transaction details by block hash and index', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getTransactionByBlockHashAndIndex",
                    params: [
                        "0x72d61b256153ce31246cdebc53a68735503f743a16e60bf00c71a2f5967ecb0c",  // Block hash
                        "0x0"  // Transaction index
                    ],
                    id: 1,
                    jsonrpc: "2.0"
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            // Check that the transaction includes necessary properties
            expect(response.body.result).toHaveProperty('blockHash', "0x72d61b256153ce31246cdebc53a68735503f743a16e60bf00c71a2f5967ecb0c");
            expect(response.body.result).toHaveProperty('transactionIndex', "0x0");
            expect(response.body.result).toHaveProperty('hash');  // Check that the transaction hash is present
            expect(response.body.result).toHaveProperty('from');  // Check that the 'from' address is present
            expect(response.body.result).toHaveProperty('to');    // Check that the 'to' address is present
            expect(response.body.result).toHaveProperty('value'); // Check that the 'value' is present
        });
    });
});
