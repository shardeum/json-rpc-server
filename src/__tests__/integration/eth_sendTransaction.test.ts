import request from 'supertest';
import { extendedServer } from '../../server';
import { time } from 'console';
const { Transaction } = require('ethereumjs-tx');
require('dotenv').config();
// Helper function to make JSON-RPC calls
async function jsonRpcRequest(method: any, params: any) {
    try {
        const response = await request(extendedServer)
            .post('/')
            .send({
                jsonrpc: '2.0',
                id: 1,
                method: method,
                params: params
            });
        return response.body;
    } catch (error) {
        console.error(`Error in JSON-RPC request: ${error}`);
        throw error;
    }
}

describe('JSON-RPC Methods - eth_sendTransaction', () => {
    describe('eth_sendTransaction', () => {
        it('should send a transaction and return the transaction hash', async () => {
            // Step 1: Get the nonce
            const nonceResult = await jsonRpcRequest('eth_getTransactionCount', ['0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698', 'latest']);
            const nonce = nonceResult.result;

            // Step 2: Create the transaction object
            const now = Math.floor(Date.now() / 1000);
            const txParams = {
                nonce: nonce,
                gasPrice: '0x09184e72a000', // 20 Gwei
                gasLimit: '0x5208', // 21000
                to: '0xC5223533feB845fD28717A7813a72af4df5F2751',
                value: '0x2386f26fc10000', // 0.01 Ether in hex
                data: '0x', // Empty data field
                chainId: 8082,
                timestamp: now
            };

            // Step 3: Create a new transaction and sign it
            const tx = new Transaction(txParams);
            const senderPrivateKey = Buffer.from('226dfdb1f49f8d4dcc6b8bdc533d3ea0fbb56f37cd7e9e1ddc986ae77b36abc0', 'hex');
            tx.sign(senderPrivateKey);

            // Step 4: Serialize the transaction
            const serializedTx = tx.serialize();
            const rawTx = '0x' + serializedTx.toString('hex');

            // Step 5: Send the signed transaction
            const response = await request(extendedServer)
                .post('/')
                .send({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_sendRawTransaction',
                    params: [rawTx]
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('result');

            // Step 6: Verify the balance of the receiving account
            const balanceResponse = await jsonRpcRequest('eth_getBalance', ['0xC5223533feB845fD28717A7813a72af4df5F2751', 'latest']);
            const balance = balanceResponse.result;
            expect(parseInt(balance, 16)).toBeGreaterThanOrEqual(parseInt('0x2386f26fc10000', 16));
        });

        it('should return an error if jsonrpc property is missing', async () => {
            const response = await request(extendedServer)
                .post('/')
                .send({
                    id: 2,
                    method: 'eth_sendTransaction',
                    params: [
                        {
                            from: '0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698',
                            to: '0xC5223533feB845fD28717A7813a72af4df5F2751',
                            gas: '0x5208',
                            gasPrice: '0x09184e72a000',
                            value: '0x2386f26fc10000',
                            data: '0x'
                        }
                    ]
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
                    method: 'eth_sendTransaction',
                    params: [
                        {
                            from: '0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698',
                            to: '0xC5223533feB845fD28717A7813a72af4df5F2751',
                            gas: '0x5208',
                            gasPrice: '0x09184e72a000',
                            value: '0x2386f26fc10000',
                            data: '0x'
                        }
                    ]
                });

            expect(response.status).toBe(204);
        });
    });

});