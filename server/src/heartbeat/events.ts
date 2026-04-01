/**
 * Run event logging — inserts structured events into heartbeat_run_events.
 */

import { heartbeatRunEvents } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';

export type RunEventKind =
  | 'started'
  | 'completed'
  | 'failed'
  | 'log'
  | 'checkout'
  | 'release';

export async function logRunEvent(
  db: Db,
  runId: string,
  companyId: string,
  kind: RunEventKind,
  payload?: unknown,
): Promise<void> {
  await db.insert(heartbeatRunEvents).values({
    runId,
    companyId,
    kind,
    payload: payload ?? null,
    createdAt: new Date(),
  });
}
