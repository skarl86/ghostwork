import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDb, cleanupTestDb } from './setup.js';
import { buildTestApp } from './helpers.js';

afterAll(async () => {
  await cleanupTestDb();
}, 30_000);

describe('Companies CRUD', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeAll(async () => {
    app = await buildTestApp(await getTestDb());
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  let companyId: string;

  it('POST /api/companies — creates a company', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/companies',
      payload: { name: 'Test Corp', description: 'A test company' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Test Corp');
    expect(body.id).toBeDefined();
    companyId = body.id;
  });

  it('GET /api/companies — lists companies', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/companies',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it('GET /api/companies/:id — gets a company by id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/companies/${companyId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Test Corp');
  });

  it('PATCH /api/companies/:id — updates a company', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/companies/${companyId}`,
      payload: { name: 'Updated Corp' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Updated Corp');
  });

  it('DELETE /api/companies/:id — deletes a company', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/companies',
      payload: { name: 'To Delete' },
    });
    const created = JSON.parse(createRes.body);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/companies/${created.id}`,
    });
    expect(res.statusCode).toBe(200);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/companies/${created.id}`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it('GET /api/companies/:id — returns 404 for missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/companies/00000000-0000-0000-0000-000000000000',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
