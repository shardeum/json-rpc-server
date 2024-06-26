import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getTransactionByBlockNumberAndIndex', () => {
        it('should return the transaction details by block number and index', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getTransactionByBlockNumberAndIndex",
                    params: [
                        "0x19f488",  // Block number in hexadecimal
                        "0x0"       // Transaction index
                    ],
                    id: 1,
                    jsonrpc: "2.0"
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            // Check that the transaction includes necessary properties
            expect(response.body.result).toHaveProperty('blockNumber', "0x19f488");
            expect(response.body.result).toHaveProperty('transactionIndex', "0x0");
            expect(response.body.result).toHaveProperty('hash');  // Check that the transaction hash is present
            expect(response.body.result).toHaveProperty('from');  // Check that the 'from' address is present
            expect(response.body.result).toHaveProperty('to');    // Check that the 'to' address is present
            expect(response.body.result).toHaveProperty('value'); // Check that the 'value' is present
        });
    });
});
