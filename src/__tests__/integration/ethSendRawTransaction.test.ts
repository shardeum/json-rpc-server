import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods - eth_sendRawTransaction', () => {
    it('should send a valid raw transaction and return the transaction hash', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_sendRawTransaction',
                params: ['0xf86c808609184e72a00082520894c5223533feb845fd28717a7813a72af4df5f2751872386f26fc100008026a0126b583b8b05b1b2a3b548fd08553769d365b833ca980d4d7ccf6ba84458353ea031470ab76cd14c1725c58eb947a69a285186714894d632655718a35fa0435231'] // This is a valid raw transaction, replace with your own
            });

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(1);
        expect(response.body.result).toMatch(/^0x[0-9a-fA-F]+$/);
        console.log('Transaction hash:', response.body.result);
    });

    it('should return an error if jsonrpc property is missing', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                id: 1,
                method: 'eth_sendRawTransaction',
                params: ['0xf86c808609184e72a00082520894c5223533feb845fd28717a7813a72af4df5f2751872386f26fc100008026a0126b583b8b05b1b2a3b548fd08553769d365b833ca980d4d7ccf6ba84458353ea031470ab76cd14c1725c58eb947a69a285186714894d632655718a35fa0435231'] // This is a valid raw transaction, replace with your own
            });

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(null);
        expect(response.body.error).toBeDefined();
        expect(response.body.error.code).toBe(-32600);
        expect(response.body.error.message).toBe('Invalid request');
    });

    it('should return no response if id property is missing', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                method: 'eth_sendRawTransaction',
                params: ['0xf86c808609184e72a00082520894c5223533feb845fd28717a7813a72af4df5f2751872386f26fc100008026a0126b583b8b05b1b2a3b548fd08553769d365b833ca980d4d7ccf6ba84458353ea031470ab76cd14c1725c58eb947a69a285186714894d632655718a35fa0435231'] // This is a valid raw transaction, replace with your own
            });
        expect(response.status).toBe(204);
    });
});

