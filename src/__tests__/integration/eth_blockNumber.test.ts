// import { server } from '../../api';
// import { Client } from 'pg';

// describe('eth_blockNumber', () => {
//     let client: Client;

//     beforeAll(async () => {
//         // Initialize the JSON RPC Server
//         await server.start();

//         // Connect to the local PostgreSQL database
//         client = new Client({
//             user: 'your_db_user',
//             host: 'localhost',
//             database: 'your_db_name',
//             password: 'your_db_password',
//             port: 5432,
//         });
//         await client.connect();

//         // Ensure the database is populated with some initial data
//         await client.query(`
//             INSERT INTO blocks (number, hash, parent_hash, timestamp)
//             VALUES
//                 (1, '0x1234abcd', '0x00000000', 1622548800),
//                 (2, '0x5678efgh', '0x1234abcd', 1622548805),
//                 (3, '0x9abcijkl', '0x5678efgh', 1622548810)
//             ON CONFLICT DO NOTHING
//         `);
//     });

//     afterAll(async () => {
//         await client.end();
//         await server.stop();
//     });

//     test('should return the latest block number', async () => {
//         const response = await server.handleRequest({
//             jsonrpc: '2.0',
//             method: 'eth_blockNumber',
//             params: [],
//             id: 1,
//         });

//         expect(response.result).toBeDefined();
//         expect(typeof response.result).toBe('string');
//         expect(response.result).toMatch(/^0x[0-9a-fA-F]+$/);

//         // Verify that the block number is the latest one in the database
//         const latestBlock = await client.query('SELECT MAX(number) as number FROM blocks');
//         const latestBlockNumber = latestBlock.rows[0].number;

//         // Convert the result to a hexadecimal string
//         const expectedBlockNumberHex = '0x' + latestBlockNumber.toString(16);

//         // Assert that the returned block number matches the latest block number in the database
//         expect(response.result).toBe(expectedBlockNumberHex);
//     });

//     test('should handle no blocks gracefully', async () => {
//         // Clear the blocks table
//         await client.query('DELETE FROM blocks');

//         const response = await server.handleRequest({
//             jsonrpc: '2.0',
//             method: 'eth_blockNumber',
//             params: [],
//             id: 2,
//         });

//         expect(response.result).toBeDefined();
//         expect(response.result).toBe('0x0');
//     });

//     test('should handle non-sequential blocks', async () => {
//         // Insert a non-sequential block number
//         await client.query(`
//             INSERT INTO blocks (number, hash, parent_hash, timestamp)
//             VALUES 
//                 (5, '0xlmnopqr', '0x9abcijkl', 1622548815)
//             ON CONFLICT DO NOTHING
//         `);

//         const response = await server.handleRequest({
//             jsonrpc: '2.0',
//             method: 'eth_blockNumber',
//             params: [],
//             id: 3,
//         });

//         expect(response.result).toBeDefined();
//         expect(typeof response.result).toBe('string');
//         expect(response.result).toMatch(/^0x[0-9a-fA-F]+$/);

//         // Verify that the block number is the latest one in the database
//         const latestBlock = await client.query('SELECT MAX(number) as number FROM blocks');
//         const latestBlockNumber = latestBlock.rows[0].number;

//         // Convert the result to a hexadecimal string
//         const expectedBlockNumberHex = '0x' + latestBlockNumber.toString(16);

//         // Assert that the returned block number matches the latest block number in the database
//         expect(response.result).toBe(expectedBlockNumberHex);
//     });
// });
