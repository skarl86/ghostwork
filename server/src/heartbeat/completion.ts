/**
 * Run Completion — finalize a run and trigger post-completion actions.
 */

import { eq, and } from 'drizzle-orm';
import { heartbeatRuns, agents, issues } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { transition, type RunStatus } from './state-machine.js';
import { releaseAndPromote } from './checkout.js';
import { logRunEvent } from './events.js';
import { NotFoundError } from '../errors.js';
import { activityService } from '../services/activity.js';
import {
  checkSubIssuesComplete,
  getPMReviewCycleCount,
  MAX_REVIEW_CYCLES,
  generateCompletionReport,
  storeCompletionReport,
} from './pm-orchestrator.js';
import { enqueueWakeup } from './queue.js';

export interface CompleteRunInput {
  exitCode?: number | null;
  signal?: string | null;
  usage?: unknown | null;
  costUsd?: string | null;
  summary?: string | null;
  provider?: string | null;
  model?: string | null;
  billingType?: string | null;
  sessionId?: string | null;
  sessionParams?: unknown | null;
}

/**
 * Complete a run — set terminal status and trigger post-completion logic.
 */
export async function completeRun(
  db: Db,
  runId: string,
  status: RunStatus,
  result?: CompleteRunInput,
): Promise<{ id: string; status: string }> {
  // Get current run
  const runRows = await db
    .select()
    .from(heartbeatRuns)
    .where(eq(heartbeatRuns.id, runId));

  const run = runRows[0];
  if (!run) throw new NotFoundError(`Run ${runId} not found`);

  // Validate transition
  transition(run.status as RunStatus, status);

  const now = new Date();

  // Update run
  await db
    .update(heartbeatRuns)
    .set({
      status,
      completedAt: now,
      exitCode: result?.exitCode ?? null,
      signal: result?.signal ?? null,
      usage: result?.usage ?? null,
      costUsd: result?.costUsd ?? null,
      summary: result?.summary ?? null,
      provider: result?.provider ?? null,
      model: result?.model ?? null,
      billingType: result?.billingType ?? null,
      sessionId: result?.sessionId ?? null,
      sessionParams: result?.sessionParams ?? null,
    })
    .where(eq(heartbeatRuns.id, runId));

  // Log event
  const eventKind = status === 'failed' ? 'failed' : 'completed';
  await logRunEvent(db, runId, run.companyId, eventKind, {
    status,
    exitCode: result?.exitCode,
    signal: result?.signal,
    costUsd: result?.costUsd,
    summary: result?.summary,
  });

  // Update agent.lastHeartbeatAt
  await db
    .update(agents)
    .set({ lastHeartbeatAt: now, updatedAt: now })
    .where(eq(agents.id, run.agentId));

  // Log activity for run completion
  await activityService(db).log({
    companyId: run.companyId,
    actorType: 'agent',
    actorId: run.agentId,
    action: status === 'failed' ? 'run.failed' : 'run.completed',
    entityType: 'run',
    entityId: runId,
    metadata: { status, costUsd: result?.costUsd, summary: result?.summary },
  });

  // Release issue lock if this run had an issue checked out
  const issueId = (run.contextSnapshot as Record<string, unknown> | null)?.['issueId'] as
    | string
    | undefined;
  if (issueId) {
    // Check if this run holds the lock
    const lockedIssue = await db
      .select({ id: issues.id })
      .from(issues)
      .where(and(eq(issues.id, issueId), eq(issues.executionRunId, runId)));

    if (lockedIssue.length > 0) {
      await releaseAndPromote(db, issueId);
    }

    // Check if this issue is a sub-issue and all siblings are done
    // If so, trigger PM review on the parent issue
    if (status === 'succeeded') {
      await checkAndTriggerPMReview(db, issueId);
    }
  }

  return { id: runId, status };
}

/**
 * Check if a completed issue is a sub-issue, and if all siblings are done,
 * trigger PM review on the parent issue.
 */
async function checkAndTriggerPMReview(db: Db, issueId: string): Promise<void> {
  // Get the completed issue to check for parentId
  const issueRows = await db
    .select({ id: issues.id, parentId: issues.parentId, companyId: issues.companyId, title: issues.title })
    .from(issues)
    .where(eq(issues.id, issueId));

  const issue = issueRows[0];
  if (!issue?.parentId) return; // Not a sub-issue

  // Log activity for sub-task completion
  await activityService(db).log({
    companyId: issue.companyId,
    actorType: 'system',
    action: 'subtask.completed',
    entityType: 'issue',
    entityId: issue.parentId,
    metadata: { subtaskId: issueId, subtaskTitle: issue.title },
  });

  // Check if all siblings are done
  const subStatus = await checkSubIssuesComplete(db, issue.parentId);

  if (!subStatus.allDone) {
    console.log(
      `[completion] Sub-issue ${issueId} done, but ${subStatus.completed}/${subStatus.total} complete for parent ${issue.parentId}`,
    );
    return;
  }

  // All sub-issues done — find the parent issue's assignee (PM agent) and wake them
  const parentRows = await db
    .select({
      id: issues.id,
      assigneeAgentId: issues.assigneeAgentId,
      companyId: issues.companyId,
      title: issues.title,
      description: issues.description,
    })
    .from(issues)
    .where(eq(issues.id, issue.parentId));

  const parent = parentRows[0];
  if (!parent?.assigneeAgentId) {
    console.log(`[completion] Parent issue ${issue.parentId} has no assignee, skipping PM review`);
    return;
  }

  // Infinite loop defense: check how many times PM has already reviewed
  const cycleCount = await getPMReviewCycleCount(db, parent.id);
  if (cycleCount >= MAX_REVIEW_CYCLES) {
    // Auto-approve to prevent infinite review loop
    await db
      .update(issues)
      .set({ status: 'done', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(issues.id, parent.id));

    await activityService(db).log({
      companyId: parent.companyId,
      actorType: 'system',
      action: 'pm.auto_approved',
      entityType: 'issue',
      entityId: parent.id,
      metadata: {
        issueTitle: parent.title,
        cycleCount,
        reason: `Auto-approved after ${cycleCount} review cycles`,
      },
    });

    console.log(
      `[completion] Auto-approved parent ${parent.id} after ${cycleCount} PM review cycles (max: ${MAX_REVIEW_CYCLES})`,
    );
    return;
  }

  // Log that we're triggering PM review
  await activityService(db).log({
    companyId: parent.companyId,
    actorType: 'system',
    action: 'pm.review_triggered',
    entityType: 'issue',
    entityId: parent.id,
    metadata: {
      issueTitle: parent.title,
      subtasksCompleted: subStatus.total,
    },
  });

  // Enqueue wakeup for the PM agent to review
  await enqueueWakeup(db, {
    companyId: parent.companyId,
    agentId: parent.assigneeAgentId,
    taskScope: 'issue',
    taskId: parent.id,
    contextSnapshot: {
      issueId: parent.id,
      issueTitle: parent.title,
      issueDescription: parent.description ?? '',
      reviewPhase: true,
    },
    reason: 'pm_review',
  });

  console.log(
    `[completion] All ${subStatus.total} sub-tasks done for parent ${issue.parentId}, triggered PM review`,
  );
}
