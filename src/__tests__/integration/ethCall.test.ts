import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods - eth_call', () => {
    it('should execute eth_call and return the result', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_call',
                params: [{
                    from: '0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698',
                    to: '0xC5223533feB845fD28717A7813a72af4df5f2751',
                    gas: '0x5208',
                    gasPrice: '0x09184e72a000',
                    value: '0x0',
                    data: '0x70a08231000000000000000000000000d46e8dd67c5d32be8058bb8eb970870f07244567'
                }, 'latest']
            });

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(1);
        expect(response.body.result).toBeDefined();
        expect(response.body.result).toMatch(/^0x[0-9a-fA-F]*$/);
    });

    it('should return an error if jsonrpc property is missing', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                id: 1,
                method: 'eth_call',
                params: [{
                    from: '0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698',
                    to: '0xC5223533feB845fD28717A7813a72af4df5f2751',
                    gas: '0x5208',
                    gasPrice: '0x09184e72a000',
                    value: '0x0',
                    data: '0x70a08231000000000000000000000000d46e8dd67c5d32be8058bb8eb970870f07244567'
                }, 'latest']
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
                method: 'eth_call',
                params: [{
                    from: '0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698',
                    to: '0xC5223533feB845fD28717A7813a72af4df5f2751',
                    gas: '0x5208',
                    gasPrice: '0x09184e72a000',
                    value: '0x0',
                    data: '0x70a08231000000000000000000000000d46e8dd67c5d32be8058bb8eb970870f07244567'
                }, 'latest']
            });

        expect(response.status).toBe(204);
    });

    it('should return an error if to property is missing', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_call',
                params: [{
                    from: '0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698',
                    gas: '0x5208',
                    gasPrice: '0x09184e72a000',
                    value: '0x0',
                    data: '0x70a08231000000000000000000000000d46e8dd67c5d32be8058bb8eb970870f07244567'
                }, 'latest']
            });

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(1);
        expect(response.body.error).toBeDefined();
        expect(response.body.error.code).toBe(-32602);
        expect(response.body.error.message).toBe(`Invalid params: 'to' or 'data' not provided`);
    });

    it('should return an error if data property is not provided', async () => {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_call',
                params: [{
                    from: '0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698',
                    to: '0xC5223533feB845fD28717A7813a72af4df5f2751',
                    gas: '0x5208',
                    gasPrice: '0x09184e72a000',
                    value: '0x0'
                }, 'latest']
            });

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.id).toBe(1);
        expect(response.body.error).toBeDefined();
        expect(response.body.error.code).toBe(-32602);
        expect(response.body.error.message).toBe(`Invalid params: 'to' or 'data' not provided`);
    });
});
