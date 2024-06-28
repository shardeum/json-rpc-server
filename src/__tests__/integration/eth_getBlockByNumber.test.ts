import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getBlockByNumber', () => {
        it('should return the block details by number with transaction details set to false', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getBlockByNumber",
                    // Add your own parameters here
                    params: [
                        "latest",  // Block number in hexadecimal
                        false       
                    ],
                    id: 1,
                    jsonrpc: "2.0"
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            // Check the block number
            expect(response.body.result).toHaveProperty('number');
            // Check that the transactions array is present
            expect(response.body.result).toHaveProperty('transactions');
            // When transaction_detail_flag is false, transactions should be an array of transaction hashes
            if (response.body.result.transactions.length > 0) {
                expect(response.body.result.transactions[0]).toMatch(/^0x[0-9a-fA-F]+$/); // Check if it is a transaction hash
            }
        });
    });
});
