/**
 * Project service — CRUD operations for projects.
 */

import { eq } from 'drizzle-orm';
import { projects } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { NotFoundError, ConflictError } from '../errors.js';

export interface CreateProjectInput {
  companyId: string;
  name: string;
  description?: string | null;
  goalId?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  status?: string;
  goalId?: string | null;
}

export function projectService(db: Db) {
  return {
    async list(opts?: { companyId?: string; limit?: number; offset?: number }) {
      const limit = opts?.limit ?? 50;
      const offset = opts?.offset ?? 0;

      if (opts?.companyId) {
        return db
          .select()
          .from(projects)
          .where(eq(projects.companyId, opts.companyId))
          .limit(limit)
          .offset(offset);
      }
      return db.select().from(projects).limit(limit).offset(offset);
    },

    async getById(id: string) {
      const rows = await db.select().from(projects).where(eq(projects.id, id));
      const row = rows[0];
      if (!row) throw new NotFoundError(`Project ${id} not found`);
      return row;
    },

    async create(input: CreateProjectInput) {
      const rows = await db
        .insert(projects)
        .values({
          companyId: input.companyId,
          name: input.name,
          description: input.description ?? null,
          goalId: input.goalId ?? null,
        })
        .returning();
      const row = rows[0];
      if (!row) throw new ConflictError('Failed to create project');
      return row;
    },

    async update(id: string, input: UpdateProjectInput) {
      const rows = await db
        .update(projects)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Project ${id} not found`);
      return row;
    },

    async remove(id: string) {
      const rows = await db
        .delete(projects)
        .where(eq(projects.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Project ${id} not found`);
      return row;
    },
  };
}
