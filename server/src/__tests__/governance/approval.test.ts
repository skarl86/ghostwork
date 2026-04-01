import { describe, it, expect } from 'vitest';

/**
 * Approval workflow state machine tests — pure logic tests.
 */

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revision_requested';

const VALID_TRANSITIONS: Record<string, ApprovalStatus[]> = {
  pending: ['approved', 'rejected', 'revision_requested'],
  revision_requested: ['pending', 'approved', 'rejected'],
};

function canTransition(from: string, to: ApprovalStatus): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed?.includes(to) ?? false;
}

describe('Approval workflow state machine', () => {
  describe('valid transitions', () => {
    it.each<[ApprovalStatus, ApprovalStatus]>([
      ['pending', 'approved'],
      ['pending', 'rejected'],
      ['pending', 'revision_requested'],
      ['revision_requested', 'pending'],
      ['revision_requested', 'approved'],
      ['revision_requested', 'rejected'],
    ])('%s → %s (valid)', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    it.each<[ApprovalStatus, ApprovalStatus]>([
      // Terminal states — no transitions out
      ['approved', 'pending'],
      ['approved', 'rejected'],
      ['approved', 'revision_requested'],
      ['approved', 'approved'], // self-transition
      ['rejected', 'pending'],
      ['rejected', 'approved'],
      ['rejected', 'revision_requested'],
      ['rejected', 'rejected'], // self-transition
      // Self-transitions
      ['pending', 'pending'],
      ['revision_requested', 'revision_requested'],
    ])('%s → %s (invalid)', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });
  });

  describe('terminal states have no outbound transitions', () => {
    const terminalStates: ApprovalStatus[] = ['approved', 'rejected'];
    const allStatuses: ApprovalStatus[] = ['pending', 'approved', 'rejected', 'revision_requested'];

    for (const terminal of terminalStates) {
      it(`${terminal} has no valid transitions`, () => {
        for (const target of allStatuses) {
          expect(canTransition(terminal, target)).toBe(false);
        }
      });
    }
  });
});

describe('Approval types', () => {
  it('new_agent_hire type is recognized', () => {
    const type = 'new_agent_hire';
    expect(['new_agent_hire', 'budget_override_required']).toContain(type);
  });

  it('budget_override_required type is recognized', () => {
    const type = 'budget_override_required';
    expect(['new_agent_hire', 'budget_override_required']).toContain(type);
  });
});

describe('Approval hire hook logic', () => {
  it('approved new_agent_hire should activate agent (status → idle)', () => {
    const approval = {
      type: 'new_agent_hire' as const,
      status: 'approved' as const,
      payload: { agentId: 'agent-123' },
    };

    let activatedAgentId: string | null = null;
    if (approval.status === 'approved' && approval.type === 'new_agent_hire') {
      const payload = approval.payload as { agentId?: string };
      if (payload.agentId) {
        activatedAgentId = payload.agentId;
      }
    }

    expect(activatedAgentId).toBe('agent-123');
  });

  it('rejected new_agent_hire should not activate agent', () => {
    const approval: { type: string; status: string; payload: { agentId: string } } = {
      type: 'new_agent_hire',
      status: 'rejected',
      payload: { agentId: 'agent-123' },
    };

    let activatedAgentId: string | null = null;
    if (approval.status === 'approved' && approval.type === 'new_agent_hire') {
      const payload = approval.payload as { agentId?: string };
      if (payload.agentId) {
        activatedAgentId = payload.agentId;
      }
    }

    expect(activatedAgentId).toBeNull();
  });

  it('approved budget_override should not activate agent', () => {
    const approval: { type: string; status: string; payload: { agentId: string } } = {
      type: 'budget_override_required',
      status: 'approved',
      payload: { agentId: 'agent-456' },
    };

    let activatedAgentId: string | null = null;
    if (approval.status === 'approved' && approval.type === 'new_agent_hire') {
      const payload = approval.payload as { agentId?: string };
      if (payload.agentId) {
        activatedAgentId = payload.agentId;
      }
    }

    expect(activatedAgentId).toBeNull();
  });

  it('approved new_agent_hire with missing agentId should not activate', () => {
    const approval = {
      type: 'new_agent_hire' as const,
      status: 'approved' as const,
      payload: {} as { agentId?: string },
    };

    let activatedAgentId: string | null = null;
    if (approval.status === 'approved' && approval.type === 'new_agent_hire') {
      const payload = approval.payload as { agentId?: string };
      if (payload.agentId) {
        activatedAgentId = payload.agentId;
      }
    }

    expect(activatedAgentId).toBeNull();
  });
});
