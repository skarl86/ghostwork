import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { getTestDb, cleanupTestDb } from './setup.js';
import { buildTestApp } from './helpers.js';

afterAll(async () => {
  await cleanupTestDb();
}, 30_000);

describe('GET /api/health', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeAll(async () => {
    const db = await getTestDb();
    app = await buildTestApp(db);
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 200 with DB status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.db.status).toBe('connected');
    expect(body.db.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.timestamp).toBeDefined();
    expect(body.memory).toBeDefined();
    expect(body.uptime).toBeDefined();
    expect(body.uptime.seconds).toBeGreaterThanOrEqual(0);
  });
});
