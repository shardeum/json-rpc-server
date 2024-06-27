import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getUncleByBlockHashAndIndex', () => {
        it('should return the uncle block details by block hash and index', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getUncleByBlockHashAndIndex",
                    // Add your own parameters here
                    params: [
                        "0x482e4546491d38883abfdbfaa29a6bfefb9269d8be90214933a8f639166b582f",  // Block hash
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
