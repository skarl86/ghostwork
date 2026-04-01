/**
 * Goal service — CRUD operations for goals.
 */

import { eq } from 'drizzle-orm';
import { goals } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { NotFoundError, ConflictError } from '../errors.js';

export interface CreateGoalInput {
  companyId: string;
  title: string;
  description?: string | null;
  level: string;
  status?: string;
  parentId?: string | null;
  ownerAgentId?: string | null;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string | null;
  level?: string;
  status?: string;
  parentId?: string | null;
  ownerAgentId?: string | null;
}

export function goalService(db: Db) {
  return {
    async list(opts?: { companyId?: string; limit?: number; offset?: number }) {
      const limit = opts?.limit ?? 50;
      const offset = opts?.offset ?? 0;

      if (opts?.companyId) {
        return db
          .select()
          .from(goals)
          .where(eq(goals.companyId, opts.companyId))
          .limit(limit)
          .offset(offset);
      }
      return db.select().from(goals).limit(limit).offset(offset);
    },

    async getById(id: string) {
      const rows = await db.select().from(goals).where(eq(goals.id, id));
      const row = rows[0];
      if (!row) throw new NotFoundError(`Goal ${id} not found`);
      return row;
    },

    async create(input: CreateGoalInput) {
      const rows = await db
        .insert(goals)
        .values({
          companyId: input.companyId,
          title: input.title,
          description: input.description ?? null,
          level: input.level,
          status: input.status ?? 'planned',
          parentId: input.parentId ?? null,
          ownerAgentId: input.ownerAgentId ?? null,
        })
        .returning();
      const row = rows[0];
      if (!row) throw new ConflictError('Failed to create goal');
      return row;
    },

    async update(id: string, input: UpdateGoalInput) {
      const rows = await db
        .update(goals)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(goals.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Goal ${id} not found`);
      return row;
    },

    async remove(id: string) {
      const rows = await db
        .delete(goals)
        .where(eq(goals.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Goal ${id} not found`);
      return row;
    },
  };
}
