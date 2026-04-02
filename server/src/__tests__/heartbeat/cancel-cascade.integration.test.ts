/**
 * Deep-tree cascading cancellation integration tests.
 *
 * Verifies a 3-level issue tree where cancelling the root propagates
 * to all descendants, cancels their runs, and clears executionRunId —
 * while leaving 'done' issues untouched.
 *
 * Tree shape:
 *   root (in_progress)
 *   ├── sub1  (in_progress, running run)
 *   ├── sub2  (in_progress, queued run)
 *   │   └── grandchild  (in_progress, deferred_issue_execution run)
 *   └── sub3  (done, no run)  ← must NOT be cancelled
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
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

  const [company] = await db
    .insert(companies)
    .values({ name: 'Cascade Cancel Corp' })
    .returning();
  companyId = company!.id;

  const [agent] = await db
    .insert(agents)
    .values({
      companyId,
      name: 'Cascade Cancel Agent',
      adapterType: 'process',
      runtimeConfig: { maxConcurrentRuns: 4, intervalSec: 60 },
    })
    .returning();
  agentId = agent!.id;

  app = await buildTestApp(db);
}, 60_000);

afterAll(async () => {
  if (app) await app.close();
  await cleanupTestDb();
}, 30_000);

describe('Deep-tree cascading cancellation', () => {
  it('cancels a 3-level issue tree and all associated runs, preserving done sub-issues', async () => {
    // ── Build the tree ──────────────────────────────────────────────

    const [root] = await db
      .insert(issues)
      .values({ companyId, title: 'Root issue', status: 'in_progress' })
      .returning();

    // sub1: running run
    const [runSub1] = await db
      .insert(heartbeatRuns)
      .values({ companyId, agentId, status: 'running', startedAt: new Date(), createdAt: new Date() })
      .returning();

    const [sub1] = await db
      .insert(issues)
      .values({
        companyId,
        title: 'Sub-issue 1 (running)',
        status: 'in_progress',
        parentId: root!.id,
        executionRunId: runSub1!.id,
      })
      .returning();

    // sub2: queued run
    const [runSub2] = await db
      .insert(heartbeatRuns)
      .values({ companyId, agentId, status: 'queued', createdAt: new Date() })
      .returning();

    const [sub2] = await db
      .insert(issues)
      .values({
        companyId,
        title: 'Sub-issue 2 (queued)',
        status: 'in_progress',
        parentId: root!.id,
        executionRunId: runSub2!.id,
      })
      .returning();

    // grandchild under sub2: deferred_issue_execution run
    const [runGrandchild] = await db
      .insert(heartbeatRuns)
      .values({ companyId, agentId, status: 'deferred_issue_execution', createdAt: new Date() })
      .returning();

    const [grandchild] = await db
      .insert(issues)
      .values({
        companyId,
        title: 'Grandchild (deferred)',
        status: 'in_progress',
        parentId: sub2!.id,
        executionRunId: runGrandchild!.id,
      })
      .returning();

    // sub3: done — must NOT be touched
    const [sub3] = await db
      .insert(issues)
      .values({
        companyId,
        title: 'Sub-issue 3 (done)',
        status: 'done',
        parentId: root!.id,
      })
      .returning();

    // ── Cancel root via API ─────────────────────────────────────────

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/issues/${root!.id}`,
      payload: { status: 'cancelled' },
    });
    expect(res.statusCode).toBe(200);

    // ── Verify issue statuses ───────────────────────────────────────

    const issueIds = [root!.id, sub1!.id, sub2!.id, grandchild!.id, sub3!.id];
    const updatedIssues = await db
      .select()
      .from(issues)
      .where(inArray(issues.id, issueIds));

    const byId = Object.fromEntries(updatedIssues.map((i) => [i.id, i]));

    expect(byId[root!.id]!.status).toBe('cancelled');
    expect(byId[sub1!.id]!.status).toBe('cancelled');
    expect(byId[sub2!.id]!.status).toBe('cancelled');
    expect(byId[grandchild!.id]!.status).toBe('cancelled');
    // done sub-issue must be preserved
    expect(byId[sub3!.id]!.status).toBe('done');

    // ── Verify executionRunId cleared on cancelled issues ───────────

    expect(byId[root!.id]!.executionRunId).toBeNull();
    expect(byId[sub1!.id]!.executionRunId).toBeNull();
    expect(byId[sub2!.id]!.executionRunId).toBeNull();
    expect(byId[grandchild!.id]!.executionRunId).toBeNull();

    // ── Verify all runs cancelled ───────────────────────────────────

    const runIds = [runSub1!.id, runSub2!.id, runGrandchild!.id];
    const updatedRuns = await db
      .select()
      .from(heartbeatRuns)
      .where(inArray(heartbeatRuns.id, runIds));

    const runById = Object.fromEntries(updatedRuns.map((r) => [r.id, r]));

    expect(runById[runSub1!.id]!.status).toBe('cancelled');
    expect(runById[runSub2!.id]!.status).toBe('cancelled');
    expect(runById[runGrandchild!.id]!.status).toBe('cancelled');
  });
});
