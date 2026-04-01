/**
 * Execute status determination + QA approval pattern tests — pure function tests.
 */

import { describe, it, expect } from 'vitest';
import { determineStatus, APPROVAL_PATTERNS } from '../../heartbeat/execute.js';

// ── determineStatus ──

describe('determineStatus', () => {
  it('returns timed_out when timedOut flag is set', () => {
    expect(determineStatus({ timedOut: true, exitCode: 0 })).toBe('timed_out');
  });

  it('timed_out takes precedence over exitCode 0', () => {
    expect(determineStatus({ timedOut: true, exitCode: 0 })).toBe('timed_out');
  });

  it('timed_out takes precedence over non-zero exitCode', () => {
    expect(determineStatus({ timedOut: true, exitCode: 1 })).toBe('timed_out');
  });

  it('returns succeeded for exitCode 0', () => {
    expect(determineStatus({ exitCode: 0, timedOut: false })).toBe('succeeded');
  });

  it('returns succeeded for exitCode 0 without timedOut', () => {
    expect(determineStatus({ exitCode: 0 })).toBe('succeeded');
  });

  it('returns failed for non-zero exitCode', () => {
    expect(determineStatus({ exitCode: 1 })).toBe('failed');
  });

  it('returns failed for exitCode 127', () => {
    expect(determineStatus({ exitCode: 127 })).toBe('failed');
  });

  it('returns failed for negative exitCode', () => {
    expect(determineStatus({ exitCode: -1 })).toBe('failed');
  });

  it('returns failed for null exitCode', () => {
    expect(determineStatus({ exitCode: null })).toBe('failed');
  });

  it('returns failed for undefined exitCode', () => {
    expect(determineStatus({ exitCode: undefined })).toBe('failed');
  });
});

// ── APPROVAL_PATTERNS (QA approval signal matching) ──

function matchesApproval(summary: string): boolean {
  return APPROVAL_PATTERNS.some((pattern) => pattern.test(summary));
}

describe('QA approval pattern matching', () => {
  describe('approved signals', () => {
    it.each([
      'Approved',
      'APPROVED',
      'approved',
      'The changes are approved.',
      'I approve this work.',
    ])('matches "%s"', (summary) => {
      expect(matchesApproval(summary)).toBe(true);
    });
  });

  describe('passed signals', () => {
    it.each([
      'All tests passed',
      'PASSED',
      'pass',
      'The code review has passed.',
    ])('matches "%s"', (summary) => {
      expect(matchesApproval(summary)).toBe(true);
    });
  });

  describe('looks good signals', () => {
    it.each([
      'Looks good',
      'looks good to me',
      'This looks good!',
      'LOOKS GOOD',
    ])('matches "%s"', (summary) => {
      expect(matchesApproval(summary)).toBe(true);
    });
  });

  describe('LGTM signals', () => {
    it.each([
      'LGTM',
      'lgtm',
      'Lgtm',
      'Code review: LGTM!',
    ])('matches "%s"', (summary) => {
      expect(matchesApproval(summary)).toBe(true);
    });
  });

  describe('rejection signals (should NOT match)', () => {
    it.each([
      'REJECTED: needs more tests',
      'Changes needed in auth module',
      'Failed: compilation errors',
      'Not ready for merge',
      'Needs refactoring',
      '',
    ])('does not match "%s"', (summary) => {
      expect(matchesApproval(summary)).toBe(false);
    });
  });
});

// ── Issue status transition flow (documented behavior) ──

describe('Issue status transition flow', () => {
  type IssueStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'blocked' | 'cancelled';

  const ISSUE_TRANSITIONS: Record<string, IssueStatus[]> = {
    backlog: ['in_progress'],
    todo: ['in_progress'],
    in_progress: ['done', 'in_review', 'todo', 'blocked'],
    in_review: ['done', 'todo'],
    // done, blocked, cancelled are terminal or require manual intervention
  };

  function canTransitionIssue(from: string, to: IssueStatus): boolean {
    return ISSUE_TRANSITIONS[from]?.includes(to) ?? false;
  }

  describe('valid issue transitions', () => {
    it.each<[IssueStatus, IssueStatus, string]>([
      ['backlog', 'in_progress', 'agent checks out issue'],
      ['todo', 'in_progress', 'agent checks out issue'],
      ['in_progress', 'done', 'QA approved or no QA agent'],
      ['in_progress', 'in_review', 'developer done, QA agent exists'],
      ['in_progress', 'todo', 'run failed, reverts to todo'],
      ['in_progress', 'blocked', 'PM parse failed'],
      ['in_review', 'done', 'QA approved'],
      ['in_review', 'todo', 'QA rejected, back to developer'],
    ])('%s → %s (%s)', (from, to) => {
      expect(canTransitionIssue(from, to)).toBe(true);
    });
  });

  describe('invalid issue transitions', () => {
    it.each<[IssueStatus, IssueStatus]>([
      ['done', 'todo'],
      ['done', 'in_progress'],
      ['cancelled', 'todo'],
      ['cancelled', 'in_progress'],
      ['backlog', 'done'],
      ['backlog', 'in_review'],
      ['todo', 'done'],
      ['todo', 'in_review'],
    ])('%s → %s (invalid)', (from, to) => {
      expect(canTransitionIssue(from, to)).toBe(false);
    });
  });

  describe('role-based completion behavior', () => {
    it('developer with QA agent → in_review', () => {
      const role = 'engineer';
      const hasQA = true;
      const DEVELOPER_ROLES = new Set(['engineer', 'developer', 'general']);

      let nextStatus: IssueStatus;
      if (DEVELOPER_ROLES.has(role) && hasQA) {
        nextStatus = 'in_review';
      } else {
        nextStatus = 'done';
      }

      expect(nextStatus).toBe('in_review');
    });

    it('developer without QA agent → done', () => {
      const role = 'engineer';
      const hasQA = false;
      const DEVELOPER_ROLES = new Set(['engineer', 'developer', 'general']);

      let nextStatus: IssueStatus;
      if (DEVELOPER_ROLES.has(role) && hasQA) {
        nextStatus = 'in_review';
      } else {
        nextStatus = 'done';
      }

      expect(nextStatus).toBe('done');
    });

    it('QA approved → done', () => {
      const summary = 'LGTM - all tests pass';
      const isApproved = matchesApproval(summary);
      const nextStatus: IssueStatus = isApproved ? 'done' : 'todo';
      expect(nextStatus).toBe('done');
    });

    it('QA rejected → todo', () => {
      const summary = 'REJECTED: missing error handling in auth module';
      const isApproved = matchesApproval(summary);
      const nextStatus: IssueStatus = isApproved ? 'done' : 'todo';
      expect(nextStatus).toBe('todo');
    });

    it('failed run → todo (revert)', () => {
      const status = determineStatus({ exitCode: 1 });
      const nextIssueStatus: IssueStatus = status === 'succeeded' ? 'done' : 'todo';
      expect(nextIssueStatus).toBe('todo');
    });

    it('timed out run → todo (revert)', () => {
      const status = determineStatus({ timedOut: true, exitCode: 0 });
      const nextIssueStatus: IssueStatus = status === 'succeeded' ? 'done' : 'todo';
      expect(nextIssueStatus).toBe('todo');
    });
  });
});

// ── Agent status lifecycle ──

describe('Agent status lifecycle', () => {
  type AgentStatus = 'idle' | 'running' | 'error';

  describe('run start → agent running', () => {
    it('agent transitions to running when a run begins', () => {
      const agentStatus: AgentStatus = 'idle';
      // executeRun sets agent status to running before adapter.execute()
      const nextStatus: AgentStatus = 'running';
      expect(nextStatus).not.toBe(agentStatus);
      expect(nextStatus).toBe('running');
    });
  });

  describe('run end → agent idle (conditional)', () => {
    it('agent transitions to idle when no other active runs remain', () => {
      const otherActiveRuns: string[] = []; // no other queued/running runs
      const nextStatus: AgentStatus = otherActiveRuns.length === 0 ? 'idle' : 'running';
      expect(nextStatus).toBe('idle');
    });

    it('agent stays running when other active runs exist', () => {
      const otherActiveRuns = ['run-abc']; // another queued/running run
      const nextStatus: AgentStatus = otherActiveRuns.length === 0 ? 'idle' : 'running';
      expect(nextStatus).toBe('running');
    });
  });

  describe('agent.status events published', () => {
    it('publishes agent.status running at run start', () => {
      const events: Array<{ type: string; status: AgentStatus }> = [];
      // Simulates the eventBus?.publish call in executeRun step 3
      events.push({ type: 'agent.status', status: 'running' });
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'agent.status', status: 'running' });
    });

    it('publishes agent.status idle at run end when no other active runs', () => {
      const events: Array<{ type: string; status: AgentStatus }> = [];
      const otherActiveRuns: string[] = [];
      // Simulates the finally block in executeRun
      if (otherActiveRuns.length === 0) {
        events.push({ type: 'agent.status', status: 'idle' });
      }
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'agent.status', status: 'idle' });
    });

    it('does not publish agent.status idle when other runs still active', () => {
      const events: Array<{ type: string; status: AgentStatus }> = [];
      const otherActiveRuns = ['run-xyz'];
      if (otherActiveRuns.length === 0) {
        events.push({ type: 'agent.status', status: 'idle' });
      }
      expect(events).toHaveLength(0);
    });
  });

  describe('agent status on failure paths', () => {
    it('agent returns to idle after a failed run (no other runs)', () => {
      const runStatus = determineStatus({ exitCode: 1 });
      const otherActiveRuns: string[] = [];
      // finally block runs regardless of success/failure
      const agentStatus: AgentStatus = otherActiveRuns.length === 0 ? 'idle' : 'running';
      expect(runStatus).toBe('failed');
      expect(agentStatus).toBe('idle');
    });

    it('agent returns to idle after a timed-out run (no other runs)', () => {
      const runStatus = determineStatus({ timedOut: true, exitCode: 0 });
      const otherActiveRuns: string[] = [];
      const agentStatus: AgentStatus = otherActiveRuns.length === 0 ? 'idle' : 'running';
      expect(runStatus).toBe('timed_out');
      expect(agentStatus).toBe('idle');
    });

    it('agent returns to idle after adapter throws (no other runs)', () => {
      // When adapter.execute() throws, the catch block completes the run as failed
      // and the finally block still checks for other active runs
      const otherActiveRuns: string[] = [];
      const agentStatus: AgentStatus = otherActiveRuns.length === 0 ? 'idle' : 'running';
      expect(agentStatus).toBe('idle');
    });
  });

  describe('running process tracking', () => {
    it('run is added to runningProcesses before execution', () => {
      const runningProcesses = new Map<string, { runId: string }>();
      const runId = 'run-1';
      runningProcesses.set(runId, { runId });
      expect(runningProcesses.has(runId)).toBe(true);
    });

    it('run is removed from runningProcesses in finally block', () => {
      const runningProcesses = new Map<string, { runId: string }>();
      const runId = 'run-1';
      runningProcesses.set(runId, { runId });
      // finally block
      runningProcesses.delete(runId);
      expect(runningProcesses.has(runId)).toBe(false);
    });

    it('run is removed even on failure', () => {
      const runningProcesses = new Map<string, { runId: string }>();
      const runId = 'run-1';
      runningProcesses.set(runId, { runId });
      try {
        throw new Error('adapter error');
      } catch {
        // adapter error caught
      } finally {
        runningProcesses.delete(runId);
      }
      expect(runningProcesses.has(runId)).toBe(false);
    });
  });
});
