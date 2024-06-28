import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getTransactionByHash', () => {
        it('should return the transaction details by transaction hash', async () => {
            // Step 1: Get the latest block to retrieve its transactions
            const latestBlockResponse = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getBlockByNumber",
                    params: [
                        "latest",  // Block number in hexadecimal
                        false
                    ],
                    id: 1,
                    jsonrpc: "2.0"
                });

            expect(latestBlockResponse.status).toBe(200);
            expect(latestBlockResponse.body.result).toBeDefined();
            const latestBlock = latestBlockResponse.body.result;
            const transactions = latestBlock.transactions;

            // Ensure there are transactions in the latest block
            if (transactions.length > 0) {
                const transactionHash = transactions[0]; // Get the hash of the first transaction

                // Step 2: Get transaction details by transaction hash
                const transactionByHashResponse = await request(extendedServer)
                    .post('/')
                    .send({
                        method: "eth_getTransactionByHash",
                        params: [
                            transactionHash  // Transaction hash in hexadecimal
                        ],
                        id: 2,
                        jsonrpc: "2.0"
                    });

                expect(transactionByHashResponse.status).toBe(200);
                expect(transactionByHashResponse.body.result).toBeDefined();
                const transaction = transactionByHashResponse.body.result;

                // Check that the transaction hash matches
                expect(transaction.hash).toBe(transactionHash);

                // Additional checks for transaction properties
                expect(transaction).toHaveProperty('blockHash', latestBlock.hash);
                expect(transaction).toHaveProperty('blockNumber', latestBlock.number);
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
