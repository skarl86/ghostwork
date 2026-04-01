/**
 * Approval workflow service — state machine for approval requests.
 *
 * Types: new_agent_hire, budget_override_required
 * States: pending → approved | rejected | revision_requested
 */

import { eq } from 'drizzle-orm';
import { approvals, approvalComments, agents } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { NotFoundError, ConflictError, UnprocessableError } from '../errors.js';

export type ApprovalType = 'new_agent_hire' | 'budget_override_required';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revision_requested';

const VALID_TRANSITIONS: Record<string, ApprovalStatus[]> = {
  pending: ['approved', 'rejected', 'revision_requested'],
  revision_requested: ['pending', 'approved', 'rejected'],
};

export interface CreateApprovalInput {
  companyId: string;
  type: ApprovalType;
  requestedByAgentId?: string | null;
  requestedByUserId?: string | null;
  payload?: unknown;
}

export interface DecideApprovalInput {
  status: 'approved' | 'rejected' | 'revision_requested';
  decidedByUserId: string;
  decisionNote?: string;
}

export interface CreateApprovalCommentInput {
  approvalId: string;
  body: string;
  authorUserId?: string | null;
  authorAgentId?: string | null;
}

export function approvalService(db: Db) {
  return {
    async list(companyId: string, limit = 50, offset = 0) {
      return db
        .select()
        .from(approvals)
        .where(eq(approvals.companyId, companyId))
        .limit(limit)
        .offset(offset);
    },

    async getById(id: string) {
      const rows = await db.select().from(approvals).where(eq(approvals.id, id));
      const row = rows[0];
      if (!row) throw new NotFoundError(`Approval ${id} not found`);
      return row;
    },

    async create(input: CreateApprovalInput) {
      const rows = await db
        .insert(approvals)
        .values({
          companyId: input.companyId,
          type: input.type,
          status: 'pending' as const,
          requestedByAgentId: input.requestedByAgentId ?? null,
          requestedByUserId: input.requestedByUserId ?? null,
          payload: input.payload ?? null,
          createdAt: new Date(),
        })
        .returning();
      const row = rows[0];
      if (!row) throw new ConflictError('Failed to create approval');
      return row;
    },

    async decide(id: string, input: DecideApprovalInput) {
      const current = await this.getById(id);

      const allowed = VALID_TRANSITIONS[current.status];
      if (!allowed?.includes(input.status)) {
        throw new UnprocessableError(
          `Cannot transition from '${current.status}' to '${input.status}'`,
        );
      }

      const rows = await db
        .update(approvals)
        .set({
          status: input.status,
          decidedByUserId: input.decidedByUserId,
          decisionNote: input.decisionNote ?? null,
          decidedAt: new Date(),
        })
        .where(eq(approvals.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Approval ${id} not found`);

      // Execute post-approval hooks
      if (input.status === 'approved') {
        await this.onApproved(row);
      }

      return row;
    },

    /**
     * Post-approval hooks — execute side effects when an approval is approved.
     */
    async onApproved(approval: typeof approvals.$inferSelect) {
      switch (approval.type) {
        case 'new_agent_hire': {
          // Activate the agent (set status to idle)
          const payload = approval.payload as { agentId?: string } | null;
          const agentId = payload?.agentId;
          if (agentId) {
            await db
              .update(agents)
              .set({ status: 'idle', updatedAt: new Date() })
              .where(eq(agents.id, agentId));
          }
          break;
        }
        case 'budget_override_required':
          // No additional side effect — caller checks approval status
          break;
      }
    },

    // ── Comments ──

    async listComments(approvalId: string, limit = 50, offset = 0) {
      return db
        .select()
        .from(approvalComments)
        .where(eq(approvalComments.approvalId, approvalId))
        .limit(limit)
        .offset(offset);
    },

    async addComment(input: CreateApprovalCommentInput) {
      // Verify approval exists
      await this.getById(input.approvalId);

      const rows = await db
        .insert(approvalComments)
        .values({
          approvalId: input.approvalId,
          body: input.body,
          authorUserId: input.authorUserId ?? null,
          authorAgentId: input.authorAgentId ?? null,
          createdAt: new Date(),
        })
        .returning();
      const row = rows[0];
      if (!row) throw new ConflictError('Failed to create comment');
      return row;
    },
  };
}
