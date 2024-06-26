import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_protocolVersion', () => {
        it('should return the protocol version', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send(
                    {
                        method: "eth_protocolVersion",
                        params: ['', "latest"],
                        id: 1,
                        jsonrpc: "2.0"
                    }
                );

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toBe('54');
        });
    });
});