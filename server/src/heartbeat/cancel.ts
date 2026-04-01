/**
 * Run Cancellation — safely terminate a running or queued heartbeat run.
 */

import { eq } from 'drizzle-orm';
import { heartbeatRuns } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { isTerminal } from './state-machine.js';
import { completeRun } from './completion.js';
import { isPidAlive } from './orphans.js';
import type { ProcessHandle } from './types.js';
import type { RunStatus } from './state-machine.js';

/** How long to wait after SIGTERM before sending SIGKILL (ms). */
const SIGKILL_TIMEOUT_MS = 5_000;

export interface CancelRunResult {
  id: string;
  status: string;
  /** Whether a process signal was sent. */
  signaled: boolean;
}

/**
 * Cancel a heartbeat run.
 *
 * 1. If the run is already in a terminal state, returns early (no-op).
 * 2. If a live process is tracked in runningProcesses, sends SIGTERM.
 *    After SIGKILL_TIMEOUT_MS, sends SIGKILL if the process is still alive.
 * 3. Transitions the run to 'cancelled' in the DB (which also releases the issue lock).
 */
export async function cancelRun(
  db: Db,
  runId: string,
  runningProcesses: Map<string, ProcessHandle>,
): Promise<CancelRunResult> {
  // Fetch current run
  const runRows = await db
    .select({ id: heartbeatRuns.id, status: heartbeatRuns.status })
    .from(heartbeatRuns)
    .where(eq(heartbeatRuns.id, runId));

  const run = runRows[0];
  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  // No-op if already terminal
  if (isTerminal(run.status as RunStatus)) {
    return { id: runId, status: run.status, signaled: false };
  }

  // Send SIGTERM to live process (if tracked)
  let signaled = false;
  const handle = runningProcesses.get(runId);
  if (handle?.pid != null) {
    try {
      process.kill(handle.pid, 'SIGTERM');
      signaled = true;

      // Schedule SIGKILL if process doesn't exit in time
      setTimeout(() => {
        if (handle.pid != null && isPidAlive(handle.pid)) {
          try {
            process.kill(handle.pid, 'SIGKILL');
          } catch {
            // Process may have already exited — ignore
          }
        }
      }, SIGKILL_TIMEOUT_MS);
    } catch {
      // Process already dead — ignore ESRCH
    }

    runningProcesses.delete(runId);
  }

  // Transition to cancelled in DB (completeRun also releases the issue lock)
  await completeRun(db, runId, 'cancelled', {
    summary: 'Cancelled by user',
    signal: signaled ? 'SIGTERM' : null,
  });

  return { id: runId, status: 'cancelled', signaled };
}
