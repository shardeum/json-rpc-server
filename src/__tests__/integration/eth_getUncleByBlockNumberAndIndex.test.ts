import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getUncleByBlockNumberAndIndex', () => {
        it('should return the uncle block details by block number and index', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_getUncleByBlockNumberAndIndex",
                    // Add your own parameters here
                    params: [
                        "0xe5",  // Block number in hexadecimal
                        "0x0"        // Uncle index in hexadecimal
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
