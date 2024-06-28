import request from 'supertest';
import { extendedServer } from '../../server';
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

describe('JSON-RPC Methods - eth_sendRawTransaction', () => {
    describe('eth_sendRawTransaction', () => {
        it('should send a raw transaction and return the transaction hash', async () => {
            // Step 1: Get the nonce
            const nonceResult = await jsonRpcRequest('eth_getTransactionCount', ['0x1923A1Eb8e4dA49604aFfd34De1B478580cf8698', 'latest']);
            const nonce = nonceResult.result;
            console.log(`Nonce: ${nonce}`);

            // Step 2: Create the transaction object
            const txParams = {
                nonce: nonce,
                gasPrice: '0x09184e72a000', // 20 Gwei
                gasLimit: '0x5208', // 21000
                to: '0xC5223533feB845fD28717A7813a72af4df5F2751',
                value: '0x2386f26fc10000', // 0.01 Ether in hex
                data: '0x', // Empty data field
                chainId: 8082,
            };

            // Ensure the private key is defined
            if (!process.env.TEST_PRIVATE_KEY) {
                throw new Error('TEST_PRIVATE_KEY environment variable is not set');
            }

            // Step 3: Create a new transaction and sign it
            const tx = new Transaction(txParams);
            const senderPrivateKey = Buffer.from(process.env.TEST_PRIVATE_KEY, 'hex');
            tx.sign(senderPrivateKey);

            // Step 4: Serialize the transaction
            const serializedTx = tx.serialize();
            const rawTx = '0x' + serializedTx.toString('hex');
            console.log(`Raw Transaction: ${rawTx}`);

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
            console.log('Transaction hash:', response.body.result);
        });
    });

});
