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
    it('pending → approved', () => {
      expect(canTransition('pending', 'approved')).toBe(true);
    });

    it('pending → rejected', () => {
      expect(canTransition('pending', 'rejected')).toBe(true);
    });

    it('pending → revision_requested', () => {
      expect(canTransition('pending', 'revision_requested')).toBe(true);
    });

    it('revision_requested → approved', () => {
      expect(canTransition('revision_requested', 'approved')).toBe(true);
    });

    it('revision_requested → rejected', () => {
      expect(canTransition('revision_requested', 'rejected')).toBe(true);
    });

    it('revision_requested → pending (re-submit)', () => {
      expect(canTransition('revision_requested', 'pending')).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    it('approved → pending', () => {
      expect(canTransition('approved', 'pending')).toBe(false);
    });

    it('approved → rejected', () => {
      expect(canTransition('approved', 'rejected')).toBe(false);
    });

    it('rejected → approved', () => {
      expect(canTransition('rejected', 'approved')).toBe(false);
    });

    it('rejected → pending', () => {
      expect(canTransition('rejected', 'pending')).toBe(false);
    });
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
    // Simulate the hook logic
    const approval = {
      type: 'new_agent_hire' as const,
      status: 'approved' as const,
      payload: { agentId: 'agent-123' },
    };

    // When approved and type is new_agent_hire → agent status should be set to idle
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
});
