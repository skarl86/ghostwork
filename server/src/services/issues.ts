/**
 * Issue service — CRUD operations for issues.
 */

import { eq, and } from 'drizzle-orm';
import { issues } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { NotFoundError, ConflictError } from '../errors.js';
import { activityService } from './activity.js';

export interface CreateIssueInput {
  companyId: string;
  title: string;
  description?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  status?: string;
  priority?: string;
  assigneeAgentId?: string | null;
}

export interface UpdateIssueInput {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  assigneeAgentId?: string | null;
  projectId?: string | null;
  goalId?: string | null;
}

export interface ListIssueOpts {
  companyId?: string;
  status?: string;
  priority?: string;
  assigneeAgentId?: string;
  parentId?: string;
  limit?: number;
  offset?: number;
}

export function issueService(db: Db) {
  return {
    async list(opts?: ListIssueOpts) {
      const limit = opts?.limit ?? 50;
      const offset = opts?.offset ?? 0;

      const conditions = [];
      if (opts?.companyId) conditions.push(eq(issues.companyId, opts.companyId));
      if (opts?.status) conditions.push(eq(issues.status, opts.status));
      if (opts?.priority) conditions.push(eq(issues.priority, opts.priority));
      if (opts?.assigneeAgentId) conditions.push(eq(issues.assigneeAgentId, opts.assigneeAgentId));
      if (opts?.parentId) conditions.push(eq(issues.parentId, opts.parentId));

      const query = db.select().from(issues);
      if (conditions.length > 0) {
        return query.where(and(...conditions)).limit(limit).offset(offset);
      }
      return query.limit(limit).offset(offset);
    },

    async getById(id: string) {
      const rows = await db.select().from(issues).where(eq(issues.id, id));
      const row = rows[0];
      if (!row) throw new NotFoundError(`Issue ${id} not found`);
      return row;
    },

    async create(input: CreateIssueInput) {
      const rows = await db
        .insert(issues)
        .values({
          companyId: input.companyId,
          title: input.title,
          description: input.description ?? null,
          projectId: input.projectId ?? null,
          goalId: input.goalId ?? null,
          status: input.status ?? 'backlog',
          priority: input.priority ?? 'medium',
          assigneeAgentId: input.assigneeAgentId ?? null,
        })
        .returning();
      const row = rows[0];
      if (!row) throw new ConflictError('Failed to create issue');
      await activityService(db).log({
        companyId: input.companyId,
        actorType: 'system',
        action: 'issue.created',
        entityType: 'issue',
        entityId: row.id,
        metadata: { title: row.title, priority: row.priority },
      });
      return row;
    },

    async update(id: string, input: UpdateIssueInput) {
      // Fetch current issue to detect status change
      const existing = input.status
        ? (await db.select().from(issues).where(eq(issues.id, id)))[0]
        : undefined;

      const rows = await db
        .update(issues)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(issues.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Issue ${id} not found`);

      if (input.status && existing && existing.status !== input.status) {
        await activityService(db).log({
          companyId: row.companyId,
          actorType: 'system',
          action: 'issue.status_changed',
          entityType: 'issue',
          entityId: row.id,
          metadata: { title: row.title, from: existing.status, to: input.status },
        });
      }
      return row;
    },

    async remove(id: string) {
      const rows = await db
        .delete(issues)
        .where(eq(issues.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Issue ${id} not found`);
      return row;
    },
  };
}
