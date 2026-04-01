/**
 * Heartbeat Engine integration tests — full lifecycle with real DB.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, cleanupTestDb } from '../setup.js';
import { buildTestApp } from '../helpers.js';
import { heartbeatRuns, heartbeatRunEvents, issues, agents, companies } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { enqueueWakeup, claimQueuedRun, resumeQueuedRuns } from '../../heartbeat/queue.js';
import { checkoutIssue, releaseIssue, releaseAndPromote, isIssueLocked } from '../../heartbeat/checkout.js';
import { completeRun } from '../../heartbeat/completion.js';
import { reapOrphanedRuns } from '../../heartbeat/orphans.js';
import { logRunEvent } from '../../heartbeat/events.js';
import type { ProcessHandle } from '../../heartbeat/types.js';

let db: Db;
let companyId: string;
let agentId: string;
let agent2Id: string;

afterAll(async () => {
  await cleanupTestDb();
}, 30_000);

beforeAll(async () => {
  db = getTestDb();

  // Seed company
  const companyRows = await db.insert(companies).values({
    name: 'Heartbeat Test Corp',
  }).returning();
  companyId = companyRows[0]!.id;

  // Seed agents
  const agentRows = await db.insert(agents).values({
    companyId,
    name: 'Agent Alpha',
    adapterType: 'process',
    runtimeConfig: { maxConcurrentRuns: 2, intervalSec: 60 },
  }).returning();
  agentId = agentRows[0]!.id;

  const agent2Rows = await db.insert(agents).values({
    companyId,
    name: 'Agent Beta',
    adapterType: 'process',
    runtimeConfig: { maxConcurrentRuns: 1 },
  }).returning();
  agent2Id = agent2Rows[0]!.id;
}, 60_000);

describe('Wakeup Queue', () => {
  it('enqueueWakeup — creates a queued run', async () => {
    const result = await enqueueWakeup(db, {
      companyId,
      agentId,
      taskScope: 'test',
      taskId: 'task-1',
    });

    expect(result.coalesced).toBe(false);
    expect(result.deferred).toBe(false);
    expect(result.runId).toBeDefined();

    // Verify in DB
    const rows = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, result.runId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('queued');
    expect(rows[0]!.agentId).toBe(agentId);
  });

  it('enqueueWakeup — coalesces into existing queued run', async () => {
    // First enqueue
    const first = await enqueueWakeup(db, {
      companyId,
      agentId: agent2Id,
      taskScope: 'coalesce-test',
      taskId: 'same-task',
      contextSnapshot: { issueIds: ['i1'] },
    });

    // Second enqueue with same scope — should coalesce
    const second = await enqueueWakeup(db, {
      companyId,
      agentId: agent2Id,
      taskScope: 'coalesce-test',
      taskId: 'same-task',
      contextSnapshot: { commentId: 'c2' },
    });

    expect(second.coalesced).toBe(true);
    expect(second.runId).toBe(first.runId);

    // Verify merged context
    const rows = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, first.runId));
    const ctx = rows[0]!.contextSnapshot as Record<string, unknown>;
    expect(ctx['issueIds']).toEqual(['i1']);
    expect(ctx['commentId']).toBe('c2');
  });

  it('enqueueWakeup — defers when issue has running execution', async () => {
    // Create a running run that references an issue
    const runRows = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'running',
      contextSnapshot: { issueId: 'deferred-issue-1' },
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();
    expect(runRows).toHaveLength(1);

    // Enqueue another for the same issue — should be deferred
    const result = await enqueueWakeup(db, {
      companyId,
      agentId: agent2Id,
      contextSnapshot: { issueId: 'deferred-issue-1' },
    });

    expect(result.deferred).toBe(true);

    // Verify status in DB
    const rows = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, result.runId));
    expect(rows[0]!.status).toBe('deferred_issue_execution');

    // Cleanup: complete the running run
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, runRows[0]!.id));
  });
});

describe('Claim & Resume', () => {
  it('claimQueuedRun — transitions queued → running', async () => {
    const { runId } = await enqueueWakeup(db, {
      companyId,
      agentId,
      taskScope: 'claim-test',
      taskId: 'claim-1',
    });

    const claimed = await claimQueuedRun(db, runId, 12345);
    expect(claimed.status).toBe('running');

    // Verify in DB
    const rows = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, runId));
    expect(rows[0]!.status).toBe('running');
    expect(rows[0]!.startedAt).toBeDefined();
    expect(rows[0]!.pid).toBe(12345);

    // Cleanup
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, runId));
  });

  it('claimQueuedRun — throws if run not queued', async () => {
    const { runId } = await enqueueWakeup(db, {
      companyId,
      agentId,
    });
    // Claim it once
    await claimQueuedRun(db, runId);

    // Try claiming again — should fail
    await expect(claimQueuedRun(db, runId)).rejects.toThrow(/not found or not in queued/);

    // Cleanup
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, runId));
  });

  it('resumeQueuedRuns — respects maxConcurrentRuns', async () => {
    // agent2 has maxConcurrentRuns=1
    // Create a running run
    const runningRow = await db.insert(heartbeatRuns).values({
      companyId,
      agentId: agent2Id,
      status: 'running',
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    // Enqueue another
    const { runId } = await enqueueWakeup(db, {
      companyId,
      agentId: agent2Id,
      taskScope: 'resume-test',
      taskId: 'resume-1',
    });

    // Resume should NOT claim (slot full for agent2)
    await resumeQueuedRuns(db);

    // The run should still be queued
    // agent2 has 1 running so maxConcurrent=1 means no slots
    const runRow = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, runId));
    expect(runRow[0]!.status).toBe('queued');

    // Cleanup
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, runningRow[0]!.id));
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, runId));
  });
});

describe('Issue Checkout / Release', () => {
  let issueId: string;

  beforeAll(async () => {
    const issueRows = await db.insert(issues).values({
      companyId,
      title: 'Checkout test issue',
      status: 'open',
    }).returning();
    issueId = issueRows[0]!.id;
  });

  it('checkoutIssue — locks the issue', async () => {
    // Create a run to use as the execution run
    const runRows = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'running',
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();
    const runId = runRows[0]!.id;

    const result = await checkoutIssue(db, issueId, agentId, runId);
    expect(result.issueId).toBe(issueId);
    expect(result.agentId).toBe(agentId);
    expect(result.runId).toBe(runId);

    // Verify lock
    expect(await isIssueLocked(db, issueId)).toBe(true);

    // Release for next tests
    await releaseIssue(db, issueId);
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, runId));
  });

  it('checkoutIssue — returns 409 on concurrent checkout', async () => {
    // First checkout
    const run1 = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'running',
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    await checkoutIssue(db, issueId, agentId, run1[0]!.id);

    // Second checkout — should conflict
    const run2 = await db.insert(heartbeatRuns).values({
      companyId,
      agentId: agent2Id,
      status: 'running',
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    await expect(
      checkoutIssue(db, issueId, agent2Id, run2[0]!.id),
    ).rejects.toThrow(/already locked/);

    // Release & cleanup
    await releaseIssue(db, issueId);
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, run1[0]!.id));
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, run2[0]!.id));
  });

  it('checkoutIssue — returns 404 for nonexistent issue', async () => {
    // Create a valid run so FK constraint doesn't fail
    const run = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'running',
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    await expect(
      checkoutIssue(db, '00000000-0000-0000-0000-000000000000', agentId, run[0]!.id),
    ).rejects.toThrow(/not found/i);

    // Cleanup
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, run[0]!.id));
  });

  it('releaseIssue — clears the lock', async () => {
    const run = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'running',
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    await checkoutIssue(db, issueId, agentId, run[0]!.id);
    expect(await isIssueLocked(db, issueId)).toBe(true);

    await releaseIssue(db, issueId);
    expect(await isIssueLocked(db, issueId)).toBe(false);

    // Cleanup
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, run[0]!.id));
  });

  it('releaseAndPromote — promotes deferred runs to queued', async () => {
    // Create a deferred run referencing this issue
    const deferredRun = await db.insert(heartbeatRuns).values({
      companyId,
      agentId: agent2Id,
      status: 'deferred_issue_execution',
      contextSnapshot: { issueId },
      createdAt: new Date(),
    }).returning();

    // Lock the issue first
    const lockRun = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'running',
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();
    await checkoutIssue(db, issueId, agentId, lockRun[0]!.id);

    // Release and promote
    const promoted = await releaseAndPromote(db, issueId);
    expect(promoted).toContain(deferredRun[0]!.id);

    // Verify deferred run is now queued
    const rows = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, deferredRun[0]!.id));
    expect(rows[0]!.status).toBe('queued');

    // Cleanup
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, lockRun[0]!.id));
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, deferredRun[0]!.id));
  });
});

describe('Run Completion', () => {
  it('completeRun — transitions running → succeeded', async () => {
    const run = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'running',
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    const result = await completeRun(db, run[0]!.id, 'succeeded', {
      exitCode: 0,
      costUsd: '0.005',
      summary: 'All good',
    });

    expect(result.status).toBe('succeeded');

    // Verify in DB
    const rows = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, run[0]!.id));
    expect(rows[0]!.status).toBe('succeeded');
    expect(rows[0]!.completedAt).toBeDefined();
    expect(rows[0]!.exitCode).toBe(0);
    expect(rows[0]!.costUsd).toBe('0.005');
    expect(rows[0]!.summary).toBe('All good');
  });

  it('completeRun — transitions running → failed', async () => {
    const run = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'running',
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    const result = await completeRun(db, run[0]!.id, 'failed', {
      exitCode: 1,
      signal: 'SIGTERM',
    });

    expect(result.status).toBe('failed');
  });

  it('completeRun — throws on invalid transition', async () => {
    const run = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'queued',
      createdAt: new Date(),
    }).returning();

    await expect(
      completeRun(db, run[0]!.id, 'succeeded'),
    ).rejects.toThrow(/invalid transition/i);

    // Cleanup
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, run[0]!.id));
  });

  it('completeRun — releases issue lock on completion', async () => {
    // Create an issue
    const issue = await db.insert(issues).values({
      companyId,
      title: 'Completion release test',
      status: 'open',
    }).returning();

    // Create a run with issueId in context
    const run = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'running',
      contextSnapshot: { issueId: issue[0]!.id },
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    // Checkout the issue
    await checkoutIssue(db, issue[0]!.id, agentId, run[0]!.id);
    expect(await isIssueLocked(db, issue[0]!.id)).toBe(true);

    // Complete the run — should auto-release
    await completeRun(db, run[0]!.id, 'succeeded');
    expect(await isIssueLocked(db, issue[0]!.id)).toBe(false);
  });
});

describe('Orphan Detection', () => {
  it('reapOrphanedRuns — marks orphaned runs as failed', async () => {
    const run = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'running',
      startedAt: new Date(),
      createdAt: new Date(),
      pid: 999999, // non-existent PID
    }).returning();

    const runningProcesses = new Map<string, ProcessHandle>();
    // Not tracking this run in memory → orphan

    const reaped = await reapOrphanedRuns(db, runningProcesses);
    const reapedIds = reaped.map((r) => r.id);
    expect(reapedIds).toContain(run[0]!.id);

    // Verify status
    const rows = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, run[0]!.id));
    expect(rows[0]!.status).toBe('failed');
  });

  it('reapOrphanedRuns — auto-retries once', async () => {
    const run = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'running',
      contextSnapshot: { retryCount: 0 },
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    const runningProcesses = new Map<string, ProcessHandle>();
    const reaped = await reapOrphanedRuns(db, runningProcesses);
    const reapedRun = reaped.find((r) => r.id === run[0]!.id);
    expect(reapedRun?.retried).toBe(true);
  });

  it('reapOrphanedRuns — does NOT retry after max retries', async () => {
    const run = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'running',
      contextSnapshot: { retryCount: 1 },
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    const runningProcesses = new Map<string, ProcessHandle>();
    const reaped = await reapOrphanedRuns(db, runningProcesses);
    const reapedRun = reaped.find((r) => r.id === run[0]!.id);
    expect(reapedRun?.retried).toBe(false);
  });
});

describe('Run Events', () => {
  it('logRunEvent — inserts event into DB', async () => {
    const run = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'running',
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    await logRunEvent(db, run[0]!.id, companyId, 'started', { pid: 123 });

    const events = await db.select().from(heartbeatRunEvents)
      .where(eq(heartbeatRunEvents.runId, run[0]!.id));

    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('started');
    expect((events[0]!.payload as Record<string, unknown>)['pid']).toBe(123);

    // Cleanup
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, run[0]!.id));
  });
});

describe('Full Cycle', () => {
  it('enqueue → claim → complete → promote deferred', async () => {
    // 1. Create an issue
    const issue = await db.insert(issues).values({
      companyId,
      title: 'Full cycle issue',
      status: 'open',
    }).returning();

    // 2. Enqueue first run
    const first = await enqueueWakeup(db, {
      companyId,
      agentId,
      contextSnapshot: { issueId: issue[0]!.id },
    });

    // 3. Claim first run
    await claimQueuedRun(db, first.runId);

    // 4. Checkout issue
    await checkoutIssue(db, issue[0]!.id, agentId, first.runId);

    // 5. Enqueue second run for same issue → should be deferred
    const second = await enqueueWakeup(db, {
      companyId,
      agentId: agent2Id,
      contextSnapshot: { issueId: issue[0]!.id },
    });
    expect(second.deferred).toBe(true);

    // 6. Complete first run → should release issue + promote deferred
    await completeRun(db, first.runId, 'succeeded', { exitCode: 0 });

    // 7. Verify deferred run is now queued
    const deferredRow = await db.select().from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, second.runId));
    expect(deferredRow[0]!.status).toBe('queued');

    // 8. Verify issue is unlocked
    expect(await isIssueLocked(db, issue[0]!.id)).toBe(false);
  });
});

describe('Heartbeat API Routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeAll(async () => {
    app = await buildTestApp(db);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('POST /api/heartbeat/wakeup — creates a wakeup', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/heartbeat/wakeup',
      payload: {
        companyId,
        agentId,
        reason: 'manual',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.runId).toBeDefined();
    expect(body.coalesced).toBe(false);
  });

  it('POST /api/heartbeat/runs — lists runs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/heartbeat/runs',
      payload: {
        companyId,
        agentId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/heartbeat/runs/:runId — get run details', async () => {
    // Create a run first
    const wakeRes = await app.inject({
      method: 'POST',
      url: '/api/heartbeat/wakeup',
      payload: { companyId, agentId },
    });
    const { runId } = JSON.parse(wakeRes.body);

    const res = await app.inject({
      method: 'GET',
      url: `/api/heartbeat/runs/${runId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(runId);
  });

  it('POST /api/issues/:issueId/checkout — locks issue', async () => {
    const issueRes = await app.inject({
      method: 'POST',
      url: '/api/issues',
      payload: { companyId, title: 'API checkout test' },
    });
    const issue = JSON.parse(issueRes.body);

    const run = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'running',
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    const res = await app.inject({
      method: 'POST',
      url: `/api/issues/${issue.id}/checkout`,
      payload: { agentId, runId: run[0]!.id },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.issueId).toBe(issue.id);

    // Cleanup: release
    await app.inject({
      method: 'POST',
      url: `/api/issues/${issue.id}/release`,
    });
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, run[0]!.id));
  });

  it('POST /api/issues/:issueId/checkout — returns 409 on conflict', async () => {
    const issueRes = await app.inject({
      method: 'POST',
      url: '/api/issues',
      payload: { companyId, title: 'API conflict test' },
    });
    const issue = JSON.parse(issueRes.body);

    const run1 = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'running',
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    const run2 = await db.insert(heartbeatRuns).values({
      companyId,
      agentId: agent2Id,
      status: 'running',
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    // First checkout
    await app.inject({
      method: 'POST',
      url: `/api/issues/${issue.id}/checkout`,
      payload: { agentId, runId: run1[0]!.id },
    });

    // Second checkout — 409
    const res = await app.inject({
      method: 'POST',
      url: `/api/issues/${issue.id}/checkout`,
      payload: { agentId: agent2Id, runId: run2[0]!.id },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('CONFLICT');

    // Cleanup
    await releaseIssue(db, issue.id);
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, run1[0]!.id));
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, run2[0]!.id));
  });

  it('POST /api/issues/:issueId/release — releases lock', async () => {
    const issueRes = await app.inject({
      method: 'POST',
      url: '/api/issues',
      payload: { companyId, title: 'API release test' },
    });
    const issue = JSON.parse(issueRes.body);

    const run = await db.insert(heartbeatRuns).values({
      companyId,
      agentId,
      status: 'running',
      startedAt: new Date(),
      createdAt: new Date(),
    }).returning();

    await app.inject({
      method: 'POST',
      url: `/api/issues/${issue.id}/checkout`,
      payload: { agentId, runId: run[0]!.id },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/issues/${issue.id}/release`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.released).toBe(true);

    // Cleanup
    await db.update(heartbeatRuns).set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(heartbeatRuns.id, run[0]!.id));
  });
});
