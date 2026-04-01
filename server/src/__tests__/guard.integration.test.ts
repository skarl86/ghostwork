import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { getTestDb, cleanupTestDb } from './setup.js';
import { buildTestApp } from './helpers.js';

afterAll(async () => {
  await cleanupTestDb();
}, 30_000);

describe('boardMutationGuard', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeAll(async () => {
    app = await buildTestApp(await getTestDb(), { mode: 'local_trusted' });
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('allows GET from any IP (blocked by auth, not guard)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/companies',
      remoteAddress: '192.168.1.100',
    });

    // Actor is 'none' for non-loopback → 401 from route, not 403 from guard
    expect(res.statusCode).toBe(401);
  });

  it('blocks POST from non-loopback IP with 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/companies',
      payload: { name: 'Evil Corp' },
      remoteAddress: '192.168.1.100',
    });

    expect(res.statusCode).toBe(403);
  });

  it('allows POST from loopback IP', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/companies',
      payload: { name: 'Good Corp' },
    });

    expect(res.statusCode).toBe(201);
  });
});
