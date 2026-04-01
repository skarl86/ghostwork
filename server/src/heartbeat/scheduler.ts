/**
 * Heartbeat Scheduler — setInterval-based loop that drives agent execution.
 */

import { eq, and, or, inArray, isNull, desc } from 'drizzle-orm';
import { agents, heartbeatRuns, issues, goals } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { enqueueWakeup } from './queue.js';
import { resumeQueuedRuns } from './queue.js';
import { reapOrphanedRuns } from './orphans.js';
import { executeRun, QA_ROLES, PLAN_REVIEW_ROLES } from './execute.js';
import type { ProcessHandle } from './types.js';
import type { LiveEventBus } from '../realtime/live-events.js';
import type { AdapterRegistry } from '@ghostwork/adapters';

export interface SchedulerConfig {
  intervalMs: number;
  apiUrl: string;
}

export interface Scheduler {
  start(): void;
  stop(): void;
  /** Manually trigger a single tick (for testing). */
  tick(): Promise<void>;
  readonly runningProcesses: Map<string, ProcessHandle>;
}

/**
 * Create a scheduler that periodically:
 * 1. Finds agents whose heartbeat interval has elapsed → enqueue wakeup
 * 2. Reaps orphaned runs
 * 3. Resumes queued runs into available slots
 */
export function createScheduler(
  db: Db,
  config: SchedulerConfig,
  eventBus?: LiveEventBus,
  adapterRegistry?: AdapterRegistry,
): Scheduler {
  let timer: ReturnType<typeof setInterval> | null = null;
  const runningProcesses = new Map<string, ProcessHandle>();

  /**
   * Find agents whose interval has elapsed and enqueue wakeups.
   */
  async function tickTimers(now: Date): Promise<string[]> {
    // Get all active agents (idle or running, not paused)
    const activeAgents = await db
      .select()
      .from(agents)
      .where(
        and(
          or(eq(agents.status, 'idle'), eq(agents.status, 'running')),
        ),
      );

    const enqueued: string[] = [];

    for (const agent of activeAgents) {
      const runtimeConfig = agent.runtimeConfig as
        | { intervalSec?: number; paused?: boolean }
        | null;

      if (runtimeConfig?.paused) continue;

      const intervalSec = runtimeConfig?.intervalSec ?? 300;
      const lastBeat = agent.lastHeartbeatAt;

      // Check if interval has elapsed
      if (lastBeat) {
        const elapsed = (now.getTime() - lastBeat.getTime()) / 1000;
        if (elapsed < intervalSec) continue;
      }
      // If no lastHeartbeatAt, treat as overdue

      // Find assigned issues that are actionable and not already being executed
      const assignedIssues = await db
        .select({
          id: issues.id,
          title: issues.title,
          description: issues.description,
          goalId: issues.goalId,
        })
        .from(issues)
        .where(
          and(
            eq(issues.assigneeAgentId, agent.id),
            inArray(issues.status, ['todo', 'in_progress', 'backlog']),
            isNull(issues.executionRunId),
          ),
        );

      // QA agents: also pick up unassigned in_review issues from their company
      let qaIssues: { id: string; title: string; description: string | null; goalId: string | null }[] = [];
      if (QA_ROLES.has(agent.role)) {
        qaIssues = await db
          .select({
            id: issues.id,
            title: issues.title,
            description: issues.description,
            goalId: issues.goalId,
          })
          .from(issues)
          .where(
            and(
              eq(issues.companyId, agent.companyId),
              eq(issues.status, 'in_review'),
              isNull(issues.executionRunId),
            ),
          );
      }

      // PM agents: pick up plan_rejected issues from their company (to revise rejected plans)
      let planRejectedIssues: { id: string; title: string; description: string | null; goalId: string | null }[] = [];
      if (agent.role === 'pm') {
        planRejectedIssues = await db
          .select({
            id: issues.id,
            title: issues.title,
            description: issues.description,
            goalId: issues.goalId,
          })
          .from(issues)
          .where(
            and(
              eq(issues.companyId, agent.companyId),
              eq(issues.status, 'plan_rejected'),
              isNull(issues.executionRunId),
            ),
          );
      }

      // Plan-reviewer agents: pick up unassigned plan_review issues from their company
      let planReviewIssues: { id: string; title: string; description: string | null; goalId: string | null }[] = [];
      if (PLAN_REVIEW_ROLES.has(agent.role)) {
        planReviewIssues = await db
          .select({
            id: issues.id,
            title: issues.title,
            description: issues.description,
            goalId: issues.goalId,
          })
          .from(issues)
          .where(
            and(
              eq(issues.companyId, agent.companyId),
              eq(issues.status, 'plan_review'),
              isNull(issues.executionRunId),
            ),
          );
      }

      const allIssues = [...assignedIssues, ...qaIssues, ...planReviewIssues, ...planRejectedIssues];
      // Deduplicate by id
      const seen = new Set<string>();
      const uniqueIssues = allIssues.filter((i) => {
        if (seen.has(i.id)) return false;
        seen.add(i.id);
        return true;
      });

      if (uniqueIssues.length === 0) continue;

      // Enqueue a wakeup per issue
      for (const issue of uniqueIssues) {
        // For QA issues, fetch previous run summary for context
        let previousRunSummary: string | undefined;
        if (QA_ROLES.has(agent.role)) {
          const prevRuns = await db
            .select({ summary: heartbeatRuns.summary })
            .from(heartbeatRuns)
            .where(
              and(
                eq(heartbeatRuns.taskId, issue.id),
                eq(heartbeatRuns.status, 'succeeded'),
              ),
            )
            .orderBy(desc(heartbeatRuns.completedAt))
            .limit(1);
          previousRunSummary = prevRuns[0]?.summary ?? undefined;
        }

        // Fetch goal context if issue has a goalId
        let goalContext: { goalTitle: string; goalDescription: string } | undefined;
        if (issue.goalId) {
          const goalRows = await db
            .select({ title: goals.title, description: goals.description })
            .from(goals)
            .where(eq(goals.id, issue.goalId))
            .limit(1);
          const goal = goalRows[0];
          if (goal) {
            goalContext = {
              goalTitle: goal.title,
              goalDescription: goal.description ?? '',
            };
          }
        }

        await enqueueWakeup(db, {
          companyId: agent.companyId,
          agentId: agent.id,
          taskScope: 'issue',
          taskId: issue.id,
          contextSnapshot: {
            issueId: issue.id,
            issueTitle: issue.title,
            issueDescription: issue.description ?? '',
            ...(goalContext ?? {}),
            ...(previousRunSummary ? { previousRunSummary } : {}),
          },
          reason: 'timer',
        });
      }

      // Publish agent status event
      eventBus?.publish({
        companyId: agent.companyId,
        type: 'agent.status',
        payload: {
          agentId: agent.id,
          name: agent.name,
          status: 'waking',
          reason: 'timer',
          issueCount: uniqueIssues.length,
        },
      });

      enqueued.push(agent.id);
    }

    return enqueued;
  }

  async function tick(): Promise<void> {
    const now = new Date();

    try {
      // 1. Tick timers — find overdue agents
      await tickTimers(now);

      // 2. Reap orphaned runs
      await reapOrphanedRuns(db, runningProcesses);

      // 3. Resume queued runs (claim them)
      const claimedRunIds = await resumeQueuedRuns(db);

      // 4. Execute claimed runs (non-blocking)
      if (adapterRegistry && claimedRunIds.length > 0) {
        for (const runId of claimedRunIds) {
          // Fetch run + agent data
          const runRows = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, runId));
          const run = runRows[0];
          if (!run) continue;

          const agentRows = await db.select().from(agents).where(eq(agents.id, run.agentId));
          const agent = agentRows[0];
          if (!agent) continue;

          // Fire and forget — don't await (runs in background)
          const execInput = {
            run: {
              id: run.id,
              agentId: run.agentId,
              companyId: run.companyId,
              taskScope: run.taskScope,
              taskId: run.taskId,
              contextSnapshot: (run.contextSnapshot as Record<string, unknown> | null) ?? undefined,
            },
            agent: {
              id: agent.id,
              companyId: agent.companyId,
              name: agent.name,
              adapterType: agent.adapterType,
              adapterConfig: (agent.adapterConfig as Record<string, unknown> | null) ?? undefined,
              runtimeConfig: (agent.runtimeConfig as Record<string, unknown> | null) ?? undefined,
            },
          };
          void executeRun(db, execInput, adapterRegistry, runningProcesses, eventBus)
            .catch((err) => console.error(`[Scheduler] executeRun error for ${runId}:`, err));
        }
      }
    } catch (err) {
      // Log but don't crash the scheduler
      console.error('[Scheduler] tick error:', err);
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => void tick(), config.intervalMs);
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },

    tick,

    get runningProcesses() {
      return runningProcesses;
    },
  };
}
