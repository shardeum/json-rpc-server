import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_submitWork', () => {
        it('should submit PoW solution and return true if it is valid', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_submitWork",
                    // Add your own parameters here
                    params: [
                        "0x0000000000000001", // Nonce
                        "0x5e01a35d15e0e4d68b57cbbf32070b015922cb688f8f6da9dc1658f1e3f8c9f5", // Header hash
                        "0xd1d6e84a86b733c5b68b87cf6d591e32e925fbcf7b2d4a7924a1a2b0ad77a83f"  // Mix digest
                    ],
                    id: 1,
                    jsonrpc: "2.0"
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(typeof response.body.result).toBe('string');
        });
    });
});
