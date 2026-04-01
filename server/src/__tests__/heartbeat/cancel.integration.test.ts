/**
 * Cascading cancellation integration tests.
 *
 * Scenarios:
 * 1. Parent cancelled → running sub-issue cancelled + its run cancelled
 * 2. Parent cancelled → queued sub-issue cancelled + its run cancelled
 * 3. Parent cancelled → deferred_issue_execution sub-issue cancelled + its run cancelled
 * 4. Parent cancelled → done sub-issue preserved (not cancelled)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, cleanupTestDb } from '../setup.js';
import { buildTestApp } from '../helpers.js';
import { heartbeatRuns, issues, agents, companies } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';

let db: Db;
let companyId: string;
let agentId: string;
let app: Awaited<ReturnType<typeof buildTestApp>>;

beforeAll(async () => {
  db = getTestDb();

  const companyRows = await db.insert(companies).values({ name: 'Cancel Test Corp' }).returning();
  companyId = companyRows[0]!.id;

  const agentRows = await db
    .insert(agents)
    .values({
      companyId,
      name: 'Cancel Test Agent',
      adapterType: 'process',
      runtimeConfig: { maxConcurrentRuns: 4, intervalSec: 60 },
    })
    .returning();
  agentId = agentRows[0]!.id;

  app = await buildTestApp(db);
}, 60_000);

afterAll(async () => {
  if (app) await app.close();
  await cleanupTestDb();
}, 30_000);

describe('Cascading cancellation', () => {
  it('cancels a running sub-issue and its run', async () => {
    // Create parent and sub-issue
    const [parent] = await db
      .insert(issues)
      .values({ companyId, title: 'Parent — running child', status: 'in_progress' })
      .returning();

    const [run] = await db
      .insert(heartbeatRuns)
      .values({ companyId, agentId, status: 'running', startedAt: new Date(), createdAt: new Date() })
      .returning();

    const [child] = await db
      .insert(issues)
      .values({
        companyId,
        title: 'Running child',
        status: 'in_progress',
        parentId: parent!.id,
        executionRunId: run!.id,
      })
      .returning();

    // Cancel parent via API
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/issues/${parent!.id}`,
      payload: { status: 'cancelled' },
    });
    expect(res.statusCode).toBe(200);

    // Parent and child both cancelled
    const [updatedParent] = await db.select().from(issues).where(eq(issues.id, parent!.id));
    const [updatedChild] = await db.select().from(issues).where(eq(issues.id, child!.id));
    expect(updatedParent!.status).toBe('cancelled');
    expect(updatedChild!.status).toBe('cancelled');

    // Run cancelled
    const [updatedRun] = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, run!.id));
    expect(updatedRun!.status).toBe('cancelled');
  });

  it('cancels a queued sub-issue and its run', async () => {
    const [parent] = await db
      .insert(issues)
      .values({ companyId, title: 'Parent — queued child', status: 'in_progress' })
      .returning();

    const [run] = await db
      .insert(heartbeatRuns)
      .values({ companyId, agentId, status: 'queued', createdAt: new Date() })
      .returning();

    const [child] = await db
      .insert(issues)
      .values({
        companyId,
        title: 'Queued child',
        status: 'in_progress',
        parentId: parent!.id,
        executionRunId: run!.id,
      })
      .returning();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/issues/${parent!.id}`,
      payload: { status: 'cancelled' },
    });
    expect(res.statusCode).toBe(200);

    const [updatedParent] = await db.select().from(issues).where(eq(issues.id, parent!.id));
    const [updatedChild] = await db.select().from(issues).where(eq(issues.id, child!.id));
    expect(updatedParent!.status).toBe('cancelled');
    expect(updatedChild!.status).toBe('cancelled');

    const [updatedRun] = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, run!.id));
    expect(updatedRun!.status).toBe('cancelled');
  });

  it('cancels a deferred_issue_execution sub-issue run', async () => {
    const [parent] = await db
      .insert(issues)
      .values({ companyId, title: 'Parent — deferred child', status: 'in_progress' })
      .returning();

    const [run] = await db
      .insert(heartbeatRuns)
      .values({
        companyId,
        agentId,
        status: 'deferred_issue_execution',
        createdAt: new Date(),
      })
      .returning();

    const [child] = await db
      .insert(issues)
      .values({
        companyId,
        title: 'Deferred child',
        status: 'in_progress',
        parentId: parent!.id,
        executionRunId: run!.id,
      })
      .returning();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/issues/${parent!.id}`,
      payload: { status: 'cancelled' },
    });
    expect(res.statusCode).toBe(200);

    const [updatedParent] = await db.select().from(issues).where(eq(issues.id, parent!.id));
    const [updatedChild] = await db.select().from(issues).where(eq(issues.id, child!.id));
    expect(updatedParent!.status).toBe('cancelled');
    expect(updatedChild!.status).toBe('cancelled');

    const [updatedRun] = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, run!.id));
    expect(updatedRun!.status).toBe('cancelled');
  });

  it('preserves a done sub-issue when parent is cancelled', async () => {
    const [parent] = await db
      .insert(issues)
      .values({ companyId, title: 'Parent — done child', status: 'in_progress' })
      .returning();

    const [child] = await db
      .insert(issues)
      .values({
        companyId,
        title: 'Done child',
        status: 'done',
        parentId: parent!.id,
      })
      .returning();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/issues/${parent!.id}`,
      payload: { status: 'cancelled' },
    });
    expect(res.statusCode).toBe(200);

    const [updatedParent] = await db.select().from(issues).where(eq(issues.id, parent!.id));
    const [updatedChild] = await db.select().from(issues).where(eq(issues.id, child!.id));
    expect(updatedParent!.status).toBe('cancelled');
    // done sub-issue must not be touched
    expect(updatedChild!.status).toBe('done');
  });
});
