import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getBlockByHash', () => {
        it('should return the block details by hash with transaction details set to false', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getBlockByHash",
                    params: [
                        "0x482e4546491d38883abfdbfaa29a6bfefb9269d8be90214933a8f639166b582f",
                        false  // Do not include full transaction objects in the block
                    ],
                    id: 1,
                    jsonrpc: "2.0"
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            // You can add more specific checks based on the structure of a block
            expect(response.body.result).toHaveProperty('hash', "0x482e4546491d38883abfdbfaa29a6bfefb9269d8be90214933a8f639166b582f");
            expect(response.body.result).toHaveProperty('number'); // Check that the block number is present
            expect(response.body.result).toHaveProperty('transactions'); // Check that the transactions array is present
            // When transaction_detail_flag is false, transactions should be an array of transaction hashes
            if (response.body.result.transactions.length > 0) {
                expect(response.body.result.transactions[0]).toMatch(/^0x[0-9a-fA-F]+$/); // Check if it is a transaction hash
            }
        });
    });
});
