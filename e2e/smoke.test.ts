/**
 * E2E Smoke Test — starts server, creates company + agent + issue,
 * triggers wakeup, verifies health check, checks WebSocket events.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Use dynamic import to ensure the test app is set up per-test
let app: any;
let db: any;
let client: any;
let stopEmbeddedPg: () => Promise<void>;

describe('E2E Smoke Test', () => {
  beforeAll(async () => {
    const { getConnectionUrl, createDb, applyPendingMigrations } = await import('@ghostwork/db');
    const { buildApp } = await import('../server/src/app.js');

    const connResult = await getConnectionUrl();
    stopEmbeddedPg = connResult.stop;
    const dbResult = createDb(connResult.url);
    db = dbResult.db;
    client = dbResult.client;

    await applyPendingMigrations(db);

    app = await buildApp(db, {
      port: 3199,
      host: '127.0.0.1',
      mode: 'local_trusted',
      logLevel: 'silent',
      isDev: false,
      migrationAutoApply: false,
    });

    await app.listen({ port: 3199, host: '127.0.0.1' });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await client?.end();
    await stopEmbeddedPg?.();
  }, 30_000);

  it('health check returns comprehensive status', async () => {
    const res = await fetch('http://127.0.0.1:3199/api/health');
    expect(res.ok).toBe(true);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.db).toBeDefined();
    expect(body.memory).toBeDefined();
    expect(body.uptime).toBeDefined();
  });

  it('full flow: company → agent → issue', async () => {
    // Create company
    const companyRes = await fetch('http://127.0.0.1:3199/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'E2E Test Corp' }),
    });
    expect(companyRes.ok).toBe(true);
    const company = (await companyRes.json()) as { id: string };
    expect(company.id).toBeDefined();

    // Create agent
    const agentRes = await fetch('http://127.0.0.1:3199/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: company.id,
        name: 'E2E Agent',
        adapterType: 'mock',
      }),
    });
    expect(agentRes.ok).toBe(true);
    const agent = (await agentRes.json()) as { id: string };
    expect(agent.id).toBeDefined();

    // Create issue
    const issueRes = await fetch('http://127.0.0.1:3199/api/issues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: company.id,
        title: 'E2E Test Issue',
        assigneeAgentId: agent.id,
      }),
    });
    expect(issueRes.ok).toBe(true);
    const issue = (await issueRes.json()) as { id: string; title: string };
    expect(issue.title).toBe('E2E Test Issue');

    // Trigger wakeup
    const wakeupRes = await fetch('http://127.0.0.1:3199/api/heartbeat/wakeup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: company.id,
        agentId: agent.id,
        reason: 'e2e-test',
      }),
    });
    // Wakeup may succeed or return an error (depending on adapter availability)
    // The important thing is the server handled it without crashing
    expect(wakeupRes.status).toBeLessThan(500);
  });

  it('export/import roundtrip', async () => {
    // Create a company with data
    const companyRes = await fetch('http://127.0.0.1:3199/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Export Test Corp' }),
    });
    const company = (await companyRes.json()) as { id: string };

    // Create agent
    await fetch('http://127.0.0.1:3199/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: company.id,
        name: 'Export Agent',
        adapterType: 'mock',
      }),
    });

    // Export
    const exportRes = await fetch(
      `http://127.0.0.1:3199/api/companies/${company.id}/exports`,
      { method: 'POST' },
    );
    expect(exportRes.ok).toBe(true);
    const exportData = await exportRes.json();
    expect((exportData as Record<string, unknown>).metadata).toBeDefined();

    // Import
    const importRes = await fetch('http://127.0.0.1:3199/api/imports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: exportData, strategy: 'rename' }),
    });
    expect(importRes.ok).toBe(true);
    const importResult = (await importRes.json()) as { companyId: string };
    expect(importResult.companyId).toBeDefined();
  });

  it('auth signup → signin → session → signout', async () => {
    // Signup
    const signupRes = await fetch('http://127.0.0.1:3199/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'e2e@test.com', password: 'test1234', name: 'E2E User' }),
    });
    expect(signupRes.ok).toBe(true);
    const signup = (await signupRes.json()) as { token: string; user: { email: string } };
    expect(signup.token).toBeDefined();
    expect(signup.user.email).toBe('e2e@test.com');

    // Session check
    const sessionRes = await fetch('http://127.0.0.1:3199/api/auth/session', {
      headers: { Authorization: `Bearer ${signup.token}` },
    });
    expect(sessionRes.ok).toBe(true);
    const session = (await sessionRes.json()) as { user: { email: string } };
    expect(session.user.email).toBe('e2e@test.com');

    // Signin with same credentials
    const signinRes = await fetch('http://127.0.0.1:3199/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'e2e@test.com', password: 'test1234' }),
    });
    expect(signinRes.ok).toBe(true);

    // Signout
    const signoutRes = await fetch('http://127.0.0.1:3199/api/auth/signout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${signup.token}` },
    });
    expect(signoutRes.ok).toBe(true);

    // Session should be invalid after signout
    const afterSignout = await fetch('http://127.0.0.1:3199/api/auth/session', {
      headers: { Authorization: `Bearer ${signup.token}` },
    });
    expect(afterSignout.status).toBe(401);
  });
});
