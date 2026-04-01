/**
 * Issue service — CRUD operations for issues.
 */

import { eq, and, inArray } from 'drizzle-orm';
import { issues, projects } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { NotFoundError, ConflictError } from '../errors.js';
import { activityService } from './activity.js';
import { resolveIssueGoalId, resolveNextIssueGoalId } from './issue-goal-fallback.js';
import { getDefaultCompanyGoal } from './goals.js';

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
      // Resolve goalId via fallback chain if not explicitly provided
      let goalId = input.goalId ?? null;
      if (!goalId) {
        let projectGoalId: string | null = null;
        if (input.projectId) {
          const proj = await db
            .select({ goalId: projects.goalId })
            .from(projects)
            .where(eq(projects.id, input.projectId))
            .then((rows) => rows[0] ?? null);
          projectGoalId = proj?.goalId ?? null;
        }
        const defaultGoal = await getDefaultCompanyGoal(db, input.companyId);
        goalId = resolveIssueGoalId({
          projectId: input.projectId ?? null,
          goalId: null,
          projectGoalId,
          defaultGoalId: defaultGoal?.id ?? null,
        });
      }

      const rows = await db
        .insert(issues)
        .values({
          companyId: input.companyId,
          title: input.title,
          description: input.description ?? null,
          projectId: input.projectId ?? null,
          goalId,
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
      // Fetch current issue to detect status/project changes
      const existing = (input.status || input.projectId !== undefined || input.goalId !== undefined)
        ? (await db.select().from(issues).where(eq(issues.id, id)))[0]
        : undefined;

      // Re-resolve goalId when projectId changes
      const updateData: Record<string, unknown> = { ...input, updatedAt: new Date() };
      if (existing && input.projectId !== undefined) {
        let currentProjectGoalId: string | null = null;
        if (existing.projectId) {
          const proj = await db
            .select({ goalId: projects.goalId })
            .from(projects)
            .where(eq(projects.id, existing.projectId))
            .then((rows) => rows[0] ?? null);
          currentProjectGoalId = proj?.goalId ?? null;
        }
        let newProjectGoalId: string | null = null;
        if (input.projectId) {
          const proj = await db
            .select({ goalId: projects.goalId })
            .from(projects)
            .where(eq(projects.id, input.projectId))
            .then((rows) => rows[0] ?? null);
          newProjectGoalId = proj?.goalId ?? null;
        }
        const defaultGoal = await getDefaultCompanyGoal(db, existing.companyId);
        updateData['goalId'] = resolveNextIssueGoalId({
          currentProjectId: existing.projectId,
          currentGoalId: existing.goalId,
          currentProjectGoalId,
          projectId: input.projectId,
          goalId: input.goalId,
          projectGoalId: newProjectGoalId,
          defaultGoalId: defaultGoal?.id ?? null,
        });
      }

      const rows = await db
        .update(issues)
        .set(updateData)
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

    /**
     * Cancel an issue and all its descendants recursively.
     * Skips issues already in 'done' or 'cancelled' state.
     * Returns all newly-cancelled issues (including the root).
     */
    async cancelWithCascade(issueId: string) {
      const now = new Date();

      // BFS to collect the root + all descendant IDs
      const allIds: string[] = [issueId];
      const queue: string[] = [issueId];
      while (queue.length > 0) {
        const parentId = queue.shift()!;
        const children = await db
          .select({ id: issues.id })
          .from(issues)
          .where(eq(issues.parentId, parentId));
        for (const child of children) {
          allIds.push(child.id);
          queue.push(child.id);
        }
      }

      // Fetch full rows to check status and get executionRunId
      const rows = await db
        .select()
        .from(issues)
        .where(inArray(issues.id, allIds));

      const toCancel = rows.filter(
        (i) => i.status !== 'cancelled' && i.status !== 'done',
      );

      if (toCancel.length > 0) {
        await db
          .update(issues)
          .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
          .where(inArray(issues.id, toCancel.map((i) => i.id)));
      }

      return toCancel;
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
