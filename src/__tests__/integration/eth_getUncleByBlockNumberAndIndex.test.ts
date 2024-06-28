import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getUncleByBlockNumberAndIndex', () => {
        it('should return the uncle block details by block number and uncle index', async () => {
            // Step 1: Get the latest block to retrieve its number
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
            const blockNumber = latestBlock.number;

            expect(blockNumber).toMatch(/^0x[0-9a-fA-F]+$/);

            // Step 2: Check if the block has uncles
            if (latestBlock.uncles.length > 0) {
                const uncleIndex = 0; // Index of the first uncle

                // Step 3: Get uncle details by block number and uncle index
                const uncleByNumberAndIndexResponse = await request(extendedServer)
                    .post('/')
                    .send({
                        method: "eth_getUncleByBlockNumberAndIndex",
                        params: [
                            blockNumber,  // Block number in hexadecimal
                            `0x${uncleIndex.toString(16)}` // Uncle index in hexadecimal
                        ],
                        id: 4,
                        jsonrpc: "2.0"
                    });

                expect(uncleByNumberAndIndexResponse.status).toBe(200);
                expect(uncleByNumberAndIndexResponse.body.result).toBeDefined();
                const uncle = uncleByNumberAndIndexResponse.body.result;

                // Additional checks for uncle properties
                expect(uncle).toHaveProperty('number');
                expect(uncle.number).toMatch(/^0x[0-9a-fA-F]+$/);
                expect(uncle).toHaveProperty('hash');
                expect(uncle.hash).toMatch(/^0x[0-9a-fA-F]+$/);
                expect(uncle).toHaveProperty('parentHash', latestBlock.hash);
            }
        });
    });
});
