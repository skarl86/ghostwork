/**
 * Orphan detection — find and reap zombie runs.
 */

import { eq } from 'drizzle-orm';
import { heartbeatRuns } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { completeRun } from './completion.js';
import { enqueueWakeup } from './queue.js';
import type { ProcessHandle } from './types.js';

/**
 * Check if a process with the given PID is alive.
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export interface ReapedRun {
  id: string;
  agentId: string;
  retried: boolean;
}

/**
 * Detect and reap orphaned runs.
 *
 * A run is orphaned if:
 * 1. It has status=running in DB
 * 2. It's not in the in-memory runningProcesses map
 * 3. For local runs: process.kill(pid, 0) fails (process is dead)
 */
export async function reapOrphanedRuns(
  db: Db,
  runningProcesses: Map<string, ProcessHandle>,
): Promise<ReapedRun[]> {
  // Find all running runs in DB
  const runningRuns = await db
    .select()
    .from(heartbeatRuns)
    .where(eq(heartbeatRuns.status, 'running'));

  const reaped: ReapedRun[] = [];

  for (const run of runningRuns) {
    // Check if it's tracked in memory
    if (runningProcesses.has(run.id)) {
      // It's tracked — check if PID is alive (for local runs)
      const handle = runningProcesses.get(run.id)!;
      if (handle.pid && isPidAlive(handle.pid)) {
        continue; // Process is alive, not an orphan
      }
      // PID dead but still in map — clean up
      runningProcesses.delete(run.id);
    }

    // Orphaned: not in memory or PID dead
    // Mark as failed
    await completeRun(db, run.id, 'failed', {
      summary: 'Orphaned run — process not found',
    });

    // Auto-retry once: check contextSnapshot for retryCount
    const ctx = run.contextSnapshot as Record<string, unknown> | null;
    const retryCount = (ctx?.['retryCount'] as number) ?? 0;
    let retried = false;

    if (retryCount < 1) {
      await enqueueWakeup(db, {
        companyId: run.companyId,
        agentId: run.agentId,
        taskScope: run.taskScope ?? undefined,
        taskId: run.taskId ?? undefined,
        contextSnapshot: {
          ...(ctx ?? {}),
          retryCount: retryCount + 1,
        },
        reason: 'orphan_retry',
      });
      retried = true;
    }

    reaped.push({ id: run.id, agentId: run.agentId, retried });
  }

  return reaped;
}
