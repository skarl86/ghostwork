/**
 * Heartbeat Run State Machine — pure function validating state transitions.
 *
 * States: queued, running, succeeded, failed, cancelled, timed_out, deferred_issue_execution
 */

export type RunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'deferred_issue_execution';

/** Terminal states — no further transitions allowed from these. */
export const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set([
  'succeeded',
  'cancelled',
  'timed_out',
]);

/**
 * Valid state transitions.
 * Key = current status, Value = set of valid target statuses.
 */
const VALID_TRANSITIONS: Record<string, ReadonlySet<RunStatus>> = {
  queued: new Set<RunStatus>(['running', 'queued', 'deferred_issue_execution', 'cancelled']),
  running: new Set<RunStatus>(['succeeded', 'failed', 'cancelled', 'timed_out']),
  deferred_issue_execution: new Set<RunStatus>(['queued', 'cancelled']),
  failed: new Set<RunStatus>(['queued']),
  // succeeded, cancelled, timed_out → no valid transitions (terminal)
};

/**
 * Check whether a transition from `from` to `to` is valid.
 */
export function canTransition(from: RunStatus, to: RunStatus): boolean {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.has(to);
}

/**
 * Assert a transition is valid, or throw.
 * Returns the target status for convenience.
 */
export function transition(from: RunStatus, to: RunStatus): RunStatus {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid transition: ${from} → ${to}`);
  }
  return to;
}

/**
 * Check whether a status is terminal (no further transitions).
 */
export function isTerminal(status: RunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
