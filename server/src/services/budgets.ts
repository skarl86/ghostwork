/**
 * Budget policy service — CRUD + budget check for agent execution cost control.
 */

import { eq, and, sql, gte } from 'drizzle-orm';
import { budgetPolicies, heartbeatRuns } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { NotFoundError, ConflictError } from '../errors.js';

export interface CreateBudgetPolicyInput {
  companyId: string;
  scopeType: 'company' | 'agent' | 'project';
  scopeId?: string | null;
  metric?: string;
  windowKind: 'monthly' | 'lifetime';
  amount: number;
  warnPercent?: number;
  hardStopEnabled?: boolean;
  notifyEnabled?: boolean;
}

export interface UpdateBudgetPolicyInput {
  amount?: number;
  warnPercent?: number;
  hardStopEnabled?: boolean;
  notifyEnabled?: boolean;
  windowKind?: 'monthly' | 'lifetime';
}

export interface BudgetCheckResult {
  allowed: boolean;
  currentSpend: number;
  limit: number;
  percentUsed: number;
  warning: boolean;
  warningMessage?: string;
  hardStop: boolean;
  policyId?: string;
}

export function budgetService(db: Db) {
  return {
    async list(companyId: string, limit = 50, offset = 0) {
      return db
        .select()
        .from(budgetPolicies)
        .where(eq(budgetPolicies.companyId, companyId))
        .limit(limit)
        .offset(offset);
    },

    async getById(id: string) {
      const rows = await db.select().from(budgetPolicies).where(eq(budgetPolicies.id, id));
      const row = rows[0];
      if (!row) throw new NotFoundError(`Budget policy ${id} not found`);
      return row;
    },

    async create(input: CreateBudgetPolicyInput) {
      const rows = await db
        .insert(budgetPolicies)
        .values({
          companyId: input.companyId,
          scopeType: input.scopeType,
          scopeId: input.scopeId ?? null,
          metric: input.metric ?? 'billed_cents',
          windowKind: input.windowKind,
          amount: input.amount,
          warnPercent: input.warnPercent ?? 80,
          hardStopEnabled: input.hardStopEnabled ?? false,
          notifyEnabled: input.notifyEnabled ?? true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      const row = rows[0];
      if (!row) throw new ConflictError('Failed to create budget policy');
      return row;
    },

    async update(id: string, input: UpdateBudgetPolicyInput) {
      const rows = await db
        .update(budgetPolicies)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(budgetPolicies.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Budget policy ${id} not found`);
      return row;
    },

    async remove(id: string) {
      const rows = await db
        .delete(budgetPolicies)
        .where(eq(budgetPolicies.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Budget policy ${id} not found`);
      return row;
    },

    /**
     * Check if an agent is within budget.
     * Finds all applicable policies (company-scope, agent-scope) and checks spend.
     */
    async checkBudget(companyId: string, agentId: string): Promise<BudgetCheckResult> {
      // Find applicable policies: company-wide or agent-specific
      const policies = await db
        .select()
        .from(budgetPolicies)
        .where(eq(budgetPolicies.companyId, companyId));

      // Filter to applicable policies
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

      // Check each policy — most restrictive wins
      let mostRestrictiveResult: BudgetCheckResult | null = null;

      for (const policy of applicable) {
        const spend = await this.getSpend(companyId, agentId, policy.windowKind);
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

        if (!mostRestrictiveResult || (!result.allowed && mostRestrictiveResult.allowed)) {
          mostRestrictiveResult = result;
        }
      }

      return mostRestrictiveResult!;
    },

    /**
     * Sum costUsd from heartbeat_runs for current window.
     * Returns cost in cents (integer).
     */
    async getSpend(
      companyId: string,
      agentId: string,
      windowKind: string,
    ): Promise<number> {
      const conditions = [
        eq(heartbeatRuns.companyId, companyId),
        eq(heartbeatRuns.agentId, agentId),
      ];

      if (windowKind === 'monthly') {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        conditions.push(gte(heartbeatRuns.createdAt, startOfMonth));
      }
      // lifetime = no date filter

      const result = await db
        .select({
          totalCents: sql<number>`coalesce(sum(cast(${heartbeatRuns.costUsd} as numeric) * 100), 0)::int`,
        })
        .from(heartbeatRuns)
        .where(and(...conditions));

      return result[0]?.totalCents ?? 0;
    },
  };
}
