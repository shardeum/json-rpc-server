import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getTransactionByBlockHashAndIndex', () => {
        it('should return the transaction details by block hash and transaction index', async () => {
            // Step 1: Get the latest block to retrieve its hash and transactions
            const latestBlockResponse = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getBlockByNumber",
                    params: ["latest", false],
                    id: 1,
                    jsonrpc: "2.0"
                });

            expect(latestBlockResponse.status).toBe(200);
            expect(latestBlockResponse.body.result).toBeDefined();
            const latestBlock = latestBlockResponse.body.result;
            const latestBlockHash = latestBlock.hash;
            const transactions = latestBlock.transactions;

            expect(latestBlockHash).toMatch(/^0x[0-9a-fA-F]+$/);

            // Ensure there are transactions in the latest block
            if (transactions.length > 0) {
                const transactionIndex = 0; // Index of the first transaction

                // Step 2: Get transaction details by block hash and transaction index
                const transactionByHashAndIndexResponse = await request(extendedServer)
                    .post('/')
                    .send({
                        method: "eth_getTransactionByBlockHashAndIndex",
                        params: [
                            latestBlockHash,  // Block hash in hexadecimal
                            `0x${transactionIndex.toString(16)}` // Transaction index in hexadecimal
                        ],
                        id: 2,
                        jsonrpc: "2.0"
                    });

                expect(transactionByHashAndIndexResponse.status).toBe(200);
                expect(transactionByHashAndIndexResponse.body.result).toBeDefined();
                const transaction = transactionByHashAndIndexResponse.body.result;

                // Check that the transaction hash matches the one in the block's transaction array
                expect(transaction.hash).toBe(transactions[transactionIndex]);

                // Additional checks for transaction properties
                expect(transaction).toHaveProperty('blockHash', latestBlockHash);
                expect(transaction).toHaveProperty('blockNumber');
                expect(transaction.blockNumber).toMatch(/^0x[0-9a-fA-F]+$/);
                expect(transaction).toHaveProperty('from');
                expect(transaction.from).toMatch(/^0x[0-9a-fA-F]{40}$/);
                expect(transaction).toHaveProperty('to');
                if (transaction.to) {
                    expect(transaction.to).toMatch(/^0x[0-9a-fA-F]{40}$/);
                }
                expect(transaction).toHaveProperty('value');
                expect(transaction.value).toMatch(/^0x[0-9a-fA-F]+$/);
            }
        });
    });
});
