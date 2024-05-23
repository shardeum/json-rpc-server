

import { extendedServer, startServer, stopServer } from '../server';
import request from 'supertest';

describe('GET /counts', () => {
    // Start the server before all tests
    beforeAll((done) => {
        startServer(); // Use the hardcoded port
        done();
    });

    // Stop the server after all tests
    afterAll((done) => {
        stopServer(done);
    });

    it('should return success response', async () => {
        const res = await request(extendedServer).get('/counts')
        expect(res.status).toBe(200)
        expect(res.text).toContain(`Counts at time`)

    })

    it('should return success response after passing authorization headers', async () => {
        const res = await request(extendedServer).get('/counts').set('Accept', 'application/json')

        const expectedResponse = {
            timestamp: expect.any(Number),
            report: [
                {
                    key: 'api',
                    count: 2,
                    subArray: [
                        {
                            key: 'counts',
                            count: 2,
                            subArray: []
                        }
                    ]
                }
            ]
        };


        expect(res.status).toBe(200)
        expect(res.body).toEqual(
            expect.objectContaining({
                timestamp: expect.any(Number),
                report: expect.arrayContaining([
                    expect.objectContaining({
                        key: 'api',
                        count: expect.any(Number),
                        subArray: expect.arrayContaining([
                            expect.objectContaining({
                                key: 'counts',
                                count: expect.any(Number),
                                subArray: expect.any(Array)
                            })
                        ])
                    })
                ])
            })
        );

    })
})

describe('GET /counts-reset', () => {
    it('should reset count', async () => {
        const res = await request(extendedServer).get('/counts-reset')
        expect(res.status).toBe(200)
        expect(res.text).toContain(`counts reset`)
    })
})

describe('GET /api/subscribe', () => {
    it('should return invalid ip or port response when missing parameters', async () => {
        const res = await request(extendedServer).get('/api/subscribe');
        expect(res.status).toBe(200);
        expect(res.text).toBe('Invalid ip or port');
    });

    it('should return node subscription rejected for invalid ip and port', async () => {
        const res = await request(extendedServer).get('/api/subscribe').query({ port: '9001' });
        expect(res.status).toBe(200);
        expect(res.text).toContain('Ip not in the nodelist');
    });
});

describe('GET /api/health', () => {
    it('should return healthy status', async () => {
        const res = await request(extendedServer).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ healthy: true });
    });
});
