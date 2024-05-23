

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