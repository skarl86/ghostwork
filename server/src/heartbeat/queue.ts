/**
 * Wakeup Queue — smart enqueuing with coalescing, deferring, and claiming.
 */

import { eq, and, sql } from 'drizzle-orm';
import { heartbeatRuns, agents } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { transition } from './state-machine.js';
import { logRunEvent } from './events.js';

export interface EnqueueWakeupParams {
  companyId: string;
  agentId: string;
  taskScope?: string | null;
  taskId?: string | null;
  contextSnapshot?: Record<string, unknown> | null;
  reason?: string | null;
}

export interface EnqueueResult {
  runId: string;
  coalesced: boolean;
  deferred: boolean;
}

/**
 * Enqueue a wakeup with 3 smart strategies:
 * 1. Coalescing — merge into existing queued run with same taskScope+taskId
 * 2. Deferring — if issue is locked, create as deferred_issue_execution
 * 3. Normal — create a new queued run
 */
export async function enqueueWakeup(
  db: Db,
  params: EnqueueWakeupParams,
): Promise<EnqueueResult> {
  // Strategy 1: Coalescing — check for existing queued run with same scope
  if (params.taskScope && params.taskId) {
    const existingQueued = await db
      .select()
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.agentId, params.agentId),
          eq(heartbeatRuns.status, 'queued'),
          eq(heartbeatRuns.taskScope, params.taskScope),
          eq(heartbeatRuns.taskId, params.taskId),
        ),
      );

    if (existingQueued.length > 0) {
      const existing = existingQueued[0]!;
      // Merge context snapshots
      const mergedContext = {
        ...(existing.contextSnapshot as Record<string, unknown> | null),
        ...params.contextSnapshot,
      };

      // Validate transition (queued → queued for coalescing)
      transition('queued', 'queued');

      await db
        .update(heartbeatRuns)
        .set({ contextSnapshot: mergedContext })
        .where(eq(heartbeatRuns.id, existing.id));

      return { runId: existing.id, coalesced: true, deferred: false };
    }
  }

  // Strategy 2: Deferring — check if the issue has a running execution
  const issueId = params.contextSnapshot?.['issueId'] as string | undefined;
  if (issueId) {
    const runningOnIssue = await db
      .select({ id: heartbeatRuns.id })
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.status, 'running'),
          sql`${heartbeatRuns.contextSnapshot}->>'issueId' = ${issueId}`,
        ),
      );

    if (runningOnIssue.length > 0) {
      // Validate transition
      transition('queued', 'deferred_issue_execution');

      const rows = await db
        .insert(heartbeatRuns)
        .values({
          companyId: params.companyId,
          agentId: params.agentId,
          status: 'deferred_issue_execution',
          taskScope: params.taskScope ?? null,
          taskId: params.taskId ?? null,
          contextSnapshot: params.contextSnapshot ?? null,
          createdAt: new Date(),
        })
        .returning();

      const run = rows[0]!;
      return { runId: run.id, coalesced: false, deferred: true };
    }
  }

  // Strategy 3: Normal — create a new queued run
  const rows = await db
    .insert(heartbeatRuns)
    .values({
      companyId: params.companyId,
      agentId: params.agentId,
      status: 'queued',
      taskScope: params.taskScope ?? null,
      taskId: params.taskId ?? null,
      contextSnapshot: params.contextSnapshot ?? null,
      createdAt: new Date(),
    })
    .returning();

  const run = rows[0]!;
  return { runId: run.id, coalesced: false, deferred: false };
}

/**
 * Claim a queued run — transition to running.
 */
export async function claimQueuedRun(
  db: Db,
  runId: string,
  pid?: number,
): Promise<{ id: string; status: string }> {
  // Validate transition
  transition('queued', 'running');

  const now = new Date();
  const rows = await db
    .update(heartbeatRuns)
    .set({
      status: 'running',
      startedAt: now,
      pid: pid ?? null,
    })
    .where(
      and(eq(heartbeatRuns.id, runId), eq(heartbeatRuns.status, 'queued')),
    )
    .returning();

  if (rows.length === 0) {
    throw new Error(`Run ${runId} not found or not in queued status`);
  }

  const run = rows[0]!;

  // Log event
  await logRunEvent(db, run.id, run.companyId, 'started', { pid });

  // Update agent lastHeartbeatAt
  await db
    .update(agents)
    .set({ lastHeartbeatAt: now })
    .where(eq(agents.id, run.agentId));

  return { id: run.id, status: run.status };
}

/**
 * Resume queued runs — find agents with available slots and claim their queued runs.
 * Returns the list of claimed run IDs.
 */
export async function resumeQueuedRuns(db: Db): Promise<string[]> {
  // Get all queued runs grouped by agent
  const queuedRuns = await db
    .select()
    .from(heartbeatRuns)
    .where(eq(heartbeatRuns.status, 'queued'))
    .orderBy(heartbeatRuns.createdAt);

  if (queuedRuns.length === 0) return [];

  // Get unique agent IDs
  const agentIds = [...new Set(queuedRuns.map((r) => r.agentId))];
  const claimedIds: string[] = [];

  for (const agentId of agentIds) {
    // Count running runs for this agent
    const runningRuns = await db
      .select({ id: heartbeatRuns.id })
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.agentId, agentId),
          eq(heartbeatRuns.status, 'running'),
        ),
      );

    // Get agent config for maxConcurrentRuns
    const agentRows = await db
      .select({ runtimeConfig: agents.runtimeConfig })
      .from(agents)
      .where(eq(agents.id, agentId));

    const runtimeConfig = agentRows[0]?.runtimeConfig as
      | { maxConcurrentRuns?: number }
      | null;
    const maxConcurrent = runtimeConfig?.maxConcurrentRuns ?? 1;
    const availableSlots = maxConcurrent - runningRuns.length;

    if (availableSlots <= 0) continue;

    // Claim up to availableSlots queued runs for this agent
    const agentQueued = queuedRuns.filter((r) => r.agentId === agentId);
    const toClaim = agentQueued.slice(0, availableSlots);

    for (const run of toClaim) {
      try {
        await claimQueuedRun(db, run.id);
        claimedIds.push(run.id);
      } catch {
        // Run may have already been claimed or cancelled — skip
      }
    }
  }

  return claimedIds;
}
