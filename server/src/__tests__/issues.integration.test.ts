import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDb, cleanupTestDb } from './setup.js';
import { buildTestApp } from './helpers.js';

afterAll(async () => {
  await cleanupTestDb();
}, 30_000);

describe('Issues CRUD', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let companyId: string;
  let issueId: string;

  beforeAll(async () => {
    app = await buildTestApp(await getTestDb());

    const res = await app.inject({
      method: 'POST',
      url: '/api/companies',
      payload: { name: 'Issue Test Corp' },
    });
    companyId = JSON.parse(res.body).id;
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('POST /api/issues — creates an issue', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/issues',
      payload: {
        companyId,
        title: 'Fix the login bug',
        description: 'Users cannot log in on Safari',
        priority: 'high',
        status: 'open',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.title).toBe('Fix the login bug');
    expect(body.priority).toBe('high');
    expect(body.status).toBe('open');
    issueId = body.id;
  });

  it('GET /api/issues?companyId= — lists issues', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/issues?companyId=${companyId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.length).toBeGreaterThan(0);
  });

  it('GET /api/issues?status= — filters by status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/issues?companyId=${companyId}&status=open`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.every((i: any) => i.status === 'open')).toBe(true);
  });

  it('GET /api/issues?priority= — filters by priority', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/issues?companyId=${companyId}&priority=high`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.every((i: any) => i.priority === 'high')).toBe(true);
  });

  it('GET /api/issues/:id — gets issue by id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/issues/${issueId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.title).toBe('Fix the login bug');
  });

  it('PATCH /api/issues/:id — updates an issue', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/issues/${issueId}`,
      payload: { status: 'in_progress', title: 'Fix the login bug (updated)' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('in_progress');
    expect(body.title).toBe('Fix the login bug (updated)');
  });

  it('DELETE /api/issues/:id — deletes an issue', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/issues',
      payload: { companyId, title: 'To Delete' },
    });
    const created = JSON.parse(createRes.body);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/issues/${created.id}`,
    });
    expect(res.statusCode).toBe(200);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/issues/${created.id}`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it('returns 404 for missing issue', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/issues/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
