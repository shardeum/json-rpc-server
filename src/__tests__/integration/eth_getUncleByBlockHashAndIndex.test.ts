import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getUncleByBlockHashAndIndex', () => {
        it('should return the uncle block details by block hash and index', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getUncleByBlockHashAndIndex",
                    params: [
                        "0x72d61b256153ce31246cdebc53a68735503f743a16e60bf00c71a2f5967ecb0c",  // Block hash
                        "0x0"  // Uncle block index
                    ],
                    id: 1,
                    jsonrpc: "2.0"
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            // Check that the uncle block includes necessary properties
            expect(response.body.result).toHaveProperty('number');  // Check that the block number is present
            expect(response.body.result).toHaveProperty('hash');    // Check that the block hash is present
            expect(response.body.result).toHaveProperty('miner');   // Check that the miner address is present
            expect(response.body.result).toHaveProperty('timestamp'); // Check that the timestamp is present
        });
    });
});
