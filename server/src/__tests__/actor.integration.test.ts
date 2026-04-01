import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { getTestDb, cleanupTestDb } from './setup.js';
import { buildTestApp } from './helpers.js';

afterAll(async () => {
  await cleanupTestDb();
}, 30_000);

describe('Actor middleware', () => {
  describe('local_trusted mode', () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>;

    beforeAll(async () => {
      app = await buildTestApp(await getTestDb(), { mode: 'local_trusted' });
    }, 60_000);

    afterAll(async () => {
      if (app) await app.close();
    });

    it('loopback request gets board actor', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(res.statusCode).toBe(200);
    });

    it('authenticated requests can access CRUD routes', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/companies',
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('authenticated mode (stub)', () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>;

    beforeAll(async () => {
      app = await buildTestApp(await getTestDb(), { mode: 'authenticated' });
    }, 60_000);

    afterAll(async () => {
      if (app) await app.close();
    });

    it('unauthenticated request gets 401 on CRUD routes', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/companies',
      });

      expect(res.statusCode).toBe(401);
    });

    it('health endpoint still works without auth', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(res.statusCode).toBe(200);
    });
  });
});
