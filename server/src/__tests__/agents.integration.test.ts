import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDb, cleanupTestDb } from './setup.js';
import { buildTestApp } from './helpers.js';

afterAll(async () => {
  await cleanupTestDb();
}, 30_000);

describe('Agents CRUD', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let companyId: string;
  let agentId: string;

  beforeAll(async () => {
    app = await buildTestApp(await getTestDb());

    const res = await app.inject({
      method: 'POST',
      url: '/api/companies',
      payload: { name: 'Agent Test Corp' },
    });
    companyId = JSON.parse(res.body).id;
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('POST /api/agents — creates an agent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents',
      payload: {
        companyId,
        name: 'Kent',
        adapterType: 'claude-local',
        role: 'engineer',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Kent');
    expect(body.adapterType).toBe('claude-local');
    agentId = body.id;
  });

  it('GET /api/agents?companyId= — lists agents by company', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/agents?companyId=${companyId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0].companyId).toBe(companyId);
  });

  it('GET /api/agents/:id — gets agent by id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/agents/${agentId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Kent');
  });

  it('PATCH /api/agents/:id — updates an agent', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/agents/${agentId}`,
      payload: { name: 'Kent v2', status: 'running' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Kent v2');
  });

  it('DELETE /api/agents/:id — deletes an agent', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      payload: { companyId, name: 'Disposable', adapterType: 'process' },
    });
    const created = JSON.parse(createRes.body);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/agents/${created.id}`,
    });
    expect(res.statusCode).toBe(200);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/agents/${created.id}`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it('GET /api/agents/:id — returns 404 for missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/agents/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
  });
});
