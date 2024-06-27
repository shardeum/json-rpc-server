import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_uninstallFilter', () => {
        it('should uninstall a filter by filter ID', async () => {
            // First, create a new filter to get a filter ID
            const newFilterResponse = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_newFilter",
                    params: [{}], // No specific parameters, using default behavior
                    id: 1,
                    jsonrpc: "2.0"
                });

            const filterId = newFilterResponse.body.result;
            
            // Now uninstall the filter using the filter ID
            const response = await request(extendedServer)
                .post('/')
                .send({
                    method: "eth_uninstallFilter",
                    params: [filterId],
                    id: 2,
                    jsonrpc: "2.0"
                });

            expect(response.status).toBe(200);
            expect(response.body.result).toBeDefined();
            expect(response.body.result).toBe(true); // Should return true if filter was successfully uninstalled
        });
    });
});
