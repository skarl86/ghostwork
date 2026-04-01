/**
 * Issue execution lock — checkout/release with PostgreSQL-level atomicity.
 */

import { eq, and, isNull, sql } from 'drizzle-orm';
import { issues, heartbeatRuns } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { ConflictError, NotFoundError } from '../errors.js';
import { transition } from './state-machine.js';
import { logRunEvent } from './events.js';

/**
 * Lock an issue for agent execution.
 * Uses SELECT ... FOR UPDATE to prevent race conditions.
 * Returns 409 Conflict if already locked.
 */
export async function checkoutIssue(
  db: Db,
  issueId: string,
  agentId: string,
  runId: string,
): Promise<{ issueId: string; agentId: string; runId: string }> {
  // Use raw SQL for SELECT ... FOR UPDATE since Drizzle doesn't natively support it.
  // We do an atomic update: only set lock if not already locked.
  const rows = await db
    .update(issues)
    .set({
      executionRunId: runId,
      executionLockedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(issues.id, issueId),
        isNull(issues.executionRunId),
      ),
    )
    .returning({ id: issues.id });

  if (rows.length === 0) {
    // Check if issue exists at all
    const existing = await db
      .select({ id: issues.id, executionRunId: issues.executionRunId })
      .from(issues)
      .where(eq(issues.id, issueId));

    if (existing.length === 0) {
      throw new NotFoundError(`Issue ${issueId} not found`);
    }

    throw new ConflictError(
      `Issue ${issueId} is already locked by run ${existing[0]?.executionRunId}`,
    );
  }

  // Log the checkout event
  const run = await db
    .select({ companyId: heartbeatRuns.companyId })
    .from(heartbeatRuns)
    .where(eq(heartbeatRuns.id, runId));
  const companyId = run[0]?.companyId;
  if (companyId) {
    await logRunEvent(db, runId, companyId, 'checkout', { issueId, agentId });
  }

  return { issueId, agentId, runId };
}

/**
 * Release the execution lock on an issue.
 */
export async function releaseIssue(
  db: Db,
  issueId: string,
): Promise<void> {
  const rows = await db
    .update(issues)
    .set({
      executionRunId: null,
      executionLockedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(issues.id, issueId))
    .returning({ id: issues.id, executionRunId: issues.executionRunId });

  if (rows.length === 0) {
    throw new NotFoundError(`Issue ${issueId} not found`);
  }
}

/**
 * Release + promote deferred runs for this issue to queued.
 */
export async function releaseAndPromote(
  db: Db,
  issueId: string,
): Promise<string[]> {
  // 1. Release the lock
  await releaseIssue(db, issueId);

  // 2. Find deferred runs that reference this issue
  const deferredRuns = await db
    .select({ id: heartbeatRuns.id, status: heartbeatRuns.status })
    .from(heartbeatRuns)
    .where(
      and(
        eq(heartbeatRuns.status, 'deferred_issue_execution'),
        sql`${heartbeatRuns.contextSnapshot}->>'issueId' = ${issueId}`,
      ),
    );

  const promotedIds: string[] = [];

  for (const run of deferredRuns) {
    // Validate transition
    transition('deferred_issue_execution', 'queued');

    await db
      .update(heartbeatRuns)
      .set({ status: 'queued' })
      .where(eq(heartbeatRuns.id, run.id));

    promotedIds.push(run.id);
  }

  return promotedIds;
}

/**
 * Check if an issue is currently locked for execution.
 */
export async function isIssueLocked(
  db: Db,
  issueId: string,
): Promise<boolean> {
  const rows = await db
    .select({ executionRunId: issues.executionRunId })
    .from(issues)
    .where(eq(issues.id, issueId));

  if (rows.length === 0) return false;
  return rows[0]!.executionRunId !== null;
}
