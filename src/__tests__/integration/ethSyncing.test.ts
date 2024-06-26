import request from 'supertest';
import { extendedServer } from '../../server';

describe('POST / eth_syncing', () => {
    it('should return false if the node is not syncing', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                method: 'eth_syncing',
                params: [],
                id: 1,
            });
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('result');
        expect(response.body.result).toBe(false);
    });

    it('should return syncing information if the node is syncing', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                method: 'eth_syncing',
                params: [],
                id: 2,
            });
        expect(response.status).toBe(200);
        if (response.body.result !== false) {
            expect(response.body.result).toHaveProperty('startingBlock');
            expect(response.body.result).toHaveProperty('currentBlock');
            expect(response.body.result).toHaveProperty('highestBlock');
            expect(response.body.result.startingBlock).toMatch(/0x[0-9a-fA-F]+/);
            expect(response.body.result.currentBlock).toMatch(/0x[0-9a-fA-F]+/);
            expect(response.body.result.highestBlock).toMatch(/0x[0-9a-fA-F]+/);
        } else {
            expect(response.body.result).toBe(false);
        }
    });
});
