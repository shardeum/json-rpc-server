

// ---------> TESTS ARE PASSING <---------
const mockArchivers = [
    { ip: '172.105.153.160', port: 4000, publicKey: '758b1c119412298802cd28dbfa394cdfeecc4074492d60844cc192d632d84de3' },
    { ip: '172.105.153.160', port: 4000, publicKey: '758b1c119412298802cd28dbfa394cdfeecc4074492d60844cc192d632d84de3' },
    { ip: '45.79.109.231', port: 4000, publicKey: '758b1c119412298802cd28dbfa394cdfeecc4074492d60844cc192d632d84de3' },
    { ip: '172.233.176.64', port: 4000, publicKey: '758b1c119412298802cd28dbfa394cdfeecc4074492d60844cc192d632d84de3' },
];

// Function to mock archiver

function mockArchiverModule() {
    jest.mock('@shardus/archiver-discovery', () => ({
        setupArchiverDiscovery: jest.fn().mockResolvedValue(undefined),
        getArchiverList: jest.fn().mockResolvedValue(mockArchivers),
        getArchiverUrl: jest.fn().mockImplementation(() => {
            const randomIndex = Math.floor(Math.random() * mockArchivers.length);
            const archiver = mockArchivers[randomIndex];
            return {
                url: `http://${archiver.ip}:${archiver.port}`,
                ...archiver
            };
        }),
    }));
}
//Call mockArchiverModule here
mockArchiverModule();

import { methods } from '../api';
import { serviceValidator } from '../external/ServiceValidator';
import * as utils from '../utils';


jest.mock('../external/ServiceValidator');
jest.mock('../utils');
jest.mock('../utils', () => ({
    ...jest.requireActual('../utils'),
    RequestersList: jest.fn(),
    getGasPrice: jest.fn().mockResolvedValue({ result: undefined }),
}));

describe('eth_gasPrice', () => {
    // Helper function to simulate a JSON-RPC call
    const callEthGasPrice = async () => {
        let result = null;
        let error = null;
        await methods.eth_gasPrice([], (err, res) => {
            error = err;
            result = res;
        });
        return { result, error };
    };
    // Enable fake timers and run all pending timers after each test
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.runAllTimers();  // Run all pending timers after each test
        jest.useRealTimers();
    });

    it('should return the gas price from the service validator on success', async () => {
        const mockGasPrice = '0x12345';
        (serviceValidator.getGasPrice as jest.Mock).mockResolvedValue(mockGasPrice);

        const { result, error } = await callEthGasPrice();

        expect(error).toBeNull();
        expect(result).toBe(mockGasPrice);
    });

    it('should return the gas price from internal logic on service validator failure', async () => {
        const mockGasPrice = '0x67890';
        (serviceValidator.getGasPrice as jest.Mock).mockResolvedValue(null); // Simulate failure
        (utils.getGasPrice as jest.Mock).mockResolvedValueOnce({ result: mockGasPrice }); // Mock successful getGasPrice

        const { result, error } = await callEthGasPrice();

        expect(error).toBeNull();
        expect(result).toBe(mockGasPrice);
    });

    it('should return a fallback gas price on failure', async () => {
        (serviceValidator.getGasPrice as jest.Mock).mockResolvedValue(null);
        (utils.getGasPrice as jest.Mock).mockRejectedValue(new Error('Failed to get gas price'));

        const { result, error } = await callEthGasPrice();

        expect(error).toBeNull();
        expect(result).toBe('0x3f84fc7516'); // 1 Gwei
    });
});

