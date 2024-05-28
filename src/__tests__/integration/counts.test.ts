

import request from 'supertest';
import { extendedServer } from '../../server';

describe('GET /counts', () => {

    it('should return success response', async () => {
        const res = await request(extendedServer).get('/counts');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Counts at time');
    });

    it('should return success response after passing authorization headers', async () => {
        const res = await request(extendedServer).get('/counts').set('Accept', 'application/json');
        expect(res.status).toBe(200);
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
                                subArray: expect.any(Array),
                            }),
                        ]),
                    }),
                ]),
            })
        );
    });
});

