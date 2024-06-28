import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getBlockByHash', () => {
        it('should return the block details by hash with transaction details set to false', async () => {
            // Step 1: Get the latest block to retrieve its hash
            const latestBlockResponse = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getBlockByNumber",
                    params: [
                        "latest",  // Block number in hexadecimal
                    ],
                    id: 1,
                    jsonrpc: "2.0"
                });

            expect(latestBlockResponse.status).toBe(200);
            expect(latestBlockResponse.body.result).toBeDefined();
            const latestBlockHash = latestBlockResponse.body.result.hash;

            expect(latestBlockHash).toMatch(/^0x[0-9a-fA-F]+$/);

            // Step 2: Get block details by hash using the retrieved hash
            const blockByHashResponse = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getBlockByHash",
                    params: [
                        latestBlockHash,  // Block hash in hexadecimal
                        false             
                    ],
                    id: 2,
                    jsonrpc: "2.0"
                });

            expect(blockByHashResponse.status).toBe(200);
            expect(blockByHashResponse.body.result).toBeDefined();

            // Check that the block hash matches the one we used
            expect(blockByHashResponse.body.result).toHaveProperty('hash', latestBlockHash);

            // Check that the transactions array is present
            expect(blockByHashResponse.body.result).toHaveProperty('transactions');
            // When transaction_detail_flag is false, transactions should be an array of transaction hashes
            if (blockByHashResponse.body.result.transactions.length > 0) {
                expect(blockByHashResponse.body.result.transactions[0]).toMatch(/^0x[0-9a-fA-F]+$/); // Check if it is a transaction hash
            }
        });
    });
});
