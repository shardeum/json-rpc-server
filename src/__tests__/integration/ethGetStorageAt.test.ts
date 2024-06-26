import request from 'supertest';
import { extendedServer } from '../../server';

describe('JSON-RPC Methods', () => {
    describe('eth_getStorageAt', () => {
        it('should return the storage value at a given position', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_getStorageAt',
                    params: [
                        '0xb6da4e0870f18247dafc9495652c394c3c8c60b8', // valid contract address
                        '0x0', // valid position
                        'latest' // block type
                    ]
                });

            expect(response.statusCode).toBe(200);
            expect(response.body).toBeDefined();
            expect(response.body.result).toMatch(/^0x[0-9a-fA-F]*$/); // Matches any hex string
        });

        // it('should return an error for invalid contract address', async () => {
        //     const response = await request(extendedServer)
        //         .post('/')
        //         .send({
        //             jsonrpc: '2.0',
        //             id: 1,
        //             method: 'eth_getStorageAt',
        //             params: [
        //                 '0x123', // invalid contract address
        //                 '0x0', // valid position
        //                 'latest' // block type
        //             ]
        //         });

        //     expect(response.statusCode).toBe(200);
        //     expect(response.body).toBeDefined();
        //     expect(response.body.error).toBeDefined();
        //     expect(response.body.error.code).toBe(-32000);
        // });

        // it('should return an error for invalid position', async () => {
        //     const response = await request(extendedServer)
        //         .post('/')
        //         .send({
        //             jsonrpc: '2.0',
        //             id: 1,
        //             method: 'eth_getStorageAt',
        //             params: [
        //                 '0xb6da4e0870f18247dafc9495652c394c3c8c60b8', // valid contract address
        //                 'invalid_position', // invalid position
        //                 'latest' // block type
        //             ]
        //         });

        //     expect(response.statusCode).toBe(200);
        //     expect(response.body).toBeDefined();
        //     expect(response.body.error).toBeDefined();
        //     expect(response.body.error.code).toBe(-32000);
        // });

        // it('should return an error for unsupported block type', async () => {
        //     const response = await request(extendedServer)
        //         .post('/')
        //         .send({
        //             jsonrpc: '2.0',
        //             id: 1,
        //             method: 'eth_getStorageAt',
        //             params: [
        //                 '0xb6da4e0870f18247dafc9495652c394c3c8c60b8', // valid contract address
        //                 '0x0', // valid position
        //                 '0x1' // unsupported block type
        //             ]
        //         });

        //     expect(response.statusCode).toBe(200);
        //     expect(response.body).toBeDefined();
        //     expect(response.body.error).toBeDefined();
        //     expect(response.body.error.code).toBe(-32000);
        // });

        // it('should return a valid converted position for shorter positions', async () => {
        //     const response = await request(extendedServer)
        //         .post('/')
        //         .send({
        //             jsonrpc: '2.0',
        //             id: 1,
        //             method: 'eth_getStorageAt',
        //             params: [
        //                 '0x0000000000000000000000000000000000000000', // valid contract address
        //                 '0x1', // shorter valid position
        //                 'latest' // block type
        //             ]
        //         });

        //     expect(response.statusCode).toBe(200);
        //     expect(response.body).toBeDefined();
        //     expect(response.body.result).toMatch(/^0x[0-9a-fA-F]*$/); // Matches any hex string
        // });
    });
});