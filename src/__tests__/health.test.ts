import { extendedServer } from '../server';
import request from 'supertest';

describe('health endpoint', () => {

    it('should return server health', async () => {
        const res = await request(extendedServer).get('/api/health')

        expect(res.status).toBe(200)
        expect(res.body).toEqual({ healthy: true });
    })
})