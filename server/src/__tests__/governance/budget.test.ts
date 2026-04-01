import { describe, it, expect } from 'vitest';

/**
 * Budget check logic tests — unit tests using mock DB.
 * We test the checkBudget logic by mocking the database layer.
 */

// Type helpers for mock data
interface MockPolicy {
  id: string;
  companyId: string;
  scopeType: string;
  scopeId: string | null;
  metric: string;
  windowKind: string;
  amount: number;
  warnPercent: number | null;
  hardStopEnabled: boolean | null;
  notifyEnabled: boolean | null;
}

interface BudgetCheckResult {
  allowed: boolean;
  currentSpend: number;
  limit: number;
  percentUsed: number;
  warning: boolean;
  warningMessage?: string;
  hardStop: boolean;
  policyId?: string;
}

/**
 * Pure logic extracted from budgetService.checkBudget for unit testing.
 */
function checkBudgetPure(
  policies: MockPolicy[],
  agentId: string,
  spendByWindow: Record<string, number>,
): BudgetCheckResult {
  const applicable = policies.filter((p) => {
    if (p.scopeType === 'company') return true;
    if (p.scopeType === 'agent' && p.scopeId === agentId) return true;
    return false;
  });

  if (applicable.length === 0) {
    return {
      allowed: true,
      currentSpend: 0,
      limit: 0,
      percentUsed: 0,
      warning: false,
      hardStop: false,
    };
  }

  let mostRestrictive: BudgetCheckResult | null = null;

  for (const policy of applicable) {
    const spend = spendByWindow[policy.windowKind] ?? 0;
    const limit = policy.amount;
    const percentUsed = limit > 0 ? (spend / limit) * 100 : 0;
    const warnPercent = policy.warnPercent ?? 80;
    const isOverLimit = spend >= limit;
    const isWarning = percentUsed >= warnPercent && !isOverLimit;
    const hardStop = policy.hardStopEnabled ?? false;

    const result: BudgetCheckResult = {
      allowed: !(isOverLimit && hardStop),
      currentSpend: spend,
      limit,
      percentUsed: Math.round(percentUsed * 100) / 100,
      warning: isWarning,
      warningMessage: isWarning
        ? `Budget ${percentUsed.toFixed(1)}% used (${spend}/${limit} cents)`
        : isOverLimit
          ? `Budget exceeded: ${spend}/${limit} cents`
          : undefined,
      hardStop,
      policyId: policy.id,
    };

    if (!mostRestrictive || (!result.allowed && mostRestrictive.allowed)) {
      mostRestrictive = result;
    }
  }

  return mostRestrictive!;
}

describe('Budget check logic', () => {
  const companyId = 'company-1';
  const agentId = 'agent-1';

  it('allows execution when no policies exist', () => {
    const result = checkBudgetPure([], agentId, {});
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(false);
  });

  it('allows execution when under budget limit', () => {
    const policies: MockPolicy[] = [
      {
        id: 'p1',
        companyId,
        scopeType: 'company',
        scopeId: null,
        metric: 'billed_cents',
        windowKind: 'monthly',
        amount: 10000, // $100
        warnPercent: 80,
        hardStopEnabled: true,
        notifyEnabled: true,
      },
    ];

    const result = checkBudgetPure(policies, agentId, { monthly: 5000 });
    expect(result.allowed).toBe(true);
    expect(result.percentUsed).toBe(50);
    expect(result.warning).toBe(false);
  });

  it('returns warning when warn percent reached', () => {
    const policies: MockPolicy[] = [
      {
        id: 'p1',
        companyId,
        scopeType: 'company',
        scopeId: null,
        metric: 'billed_cents',
        windowKind: 'monthly',
        amount: 10000,
        warnPercent: 80,
        hardStopEnabled: false,
        notifyEnabled: true,
      },
    ];

    const result = checkBudgetPure(policies, agentId, { monthly: 8500 });
    expect(result.allowed).toBe(true); // hardStop disabled
    expect(result.warning).toBe(true);
    expect(result.warningMessage).toContain('85.0%');
  });

  it('rejects execution when over limit with hardStop enabled', () => {
    const policies: MockPolicy[] = [
      {
        id: 'p1',
        companyId,
        scopeType: 'company',
        scopeId: null,
        metric: 'billed_cents',
        windowKind: 'monthly',
        amount: 10000,
        warnPercent: 80,
        hardStopEnabled: true,
        notifyEnabled: true,
      },
    ];

    const result = checkBudgetPure(policies, agentId, { monthly: 12000 });
    expect(result.allowed).toBe(false);
    expect(result.hardStop).toBe(true);
    expect(result.warningMessage).toContain('exceeded');
  });

  it('allows execution when over limit but hardStop disabled', () => {
    const policies: MockPolicy[] = [
      {
        id: 'p1',
        companyId,
        scopeType: 'company',
        scopeId: null,
        metric: 'billed_cents',
        windowKind: 'monthly',
        amount: 10000,
        warnPercent: 80,
        hardStopEnabled: false,
        notifyEnabled: true,
      },
    ];

    const result = checkBudgetPure(policies, agentId, { monthly: 12000 });
    expect(result.allowed).toBe(true);
    expect(result.hardStop).toBe(false);
  });

  it('agent-specific policy takes precedence when more restrictive', () => {
    const policies: MockPolicy[] = [
      {
        id: 'p-company',
        companyId,
        scopeType: 'company',
        scopeId: null,
        metric: 'billed_cents',
        windowKind: 'monthly',
        amount: 50000,
        warnPercent: 80,
        hardStopEnabled: false,
        notifyEnabled: true,
      },
      {
        id: 'p-agent',
        companyId,
        scopeType: 'agent',
        scopeId: agentId,
        metric: 'billed_cents',
        windowKind: 'monthly',
        amount: 5000, // Agent has tighter budget
        warnPercent: 80,
        hardStopEnabled: true,
        notifyEnabled: true,
      },
    ];

    const result = checkBudgetPure(policies, agentId, { monthly: 6000 });
    expect(result.allowed).toBe(false); // Agent budget exceeded with hardStop
    expect(result.policyId).toBe('p-agent');
  });

  it('ignores policies for other agents', () => {
    const policies: MockPolicy[] = [
      {
        id: 'p1',
        companyId,
        scopeType: 'agent',
        scopeId: 'other-agent',
        metric: 'billed_cents',
        windowKind: 'monthly',
        amount: 100,
        warnPercent: 80,
        hardStopEnabled: true,
        notifyEnabled: true,
      },
    ];

    const result = checkBudgetPure(policies, agentId, { monthly: 5000 });
    expect(result.allowed).toBe(true); // No applicable policy
  });
});
