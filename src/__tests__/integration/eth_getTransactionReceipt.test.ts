import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getTransactionReceipt', () => {
        it('should return the transaction receipt by hash', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getTransactionReceipt",
                    params: [
                        "0x72d61b256153ce31246cdebc53a68735503f743a16e60bf00c71a2f5967ecb0c"
                    ],
                    id: 1,
                    jsonrpc: "2.0"
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            // Check that the transaction receipt includes necessary properties
            expect(response.body.result).toHaveProperty('transactionHash', "0x72d61b256153ce31246cdebc53a68735503f743a16e60bf00c71a2f5967ecb0c");
            expect(response.body.result).toHaveProperty('blockHash');  // Check that the block hash is present
            expect(response.body.result).toHaveProperty('blockNumber'); // Check that the block number is present
            expect(response.body.result).toHaveProperty('cumulativeGasUsed'); // Check that the cumulative gas used is present
            expect(response.body.result).toHaveProperty('gasUsed'); // Check that the gas used is present
            expect(response.body.result).toHaveProperty('status'); // Check that the status is present
        });
    });
});
