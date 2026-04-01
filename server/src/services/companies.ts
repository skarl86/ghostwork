/**
 * Company service — CRUD operations for companies.
 */

import { eq } from 'drizzle-orm';
import { companies } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { NotFoundError, ConflictError } from '../errors.js';
import { activityService } from './activity.js';

export interface CreateCompanyInput {
  name: string;
  description?: string | null;
}

export interface UpdateCompanyInput {
  name?: string;
  description?: string | null;
  status?: string;
}

export function companyService(db: Db) {
  return {
    async list(opts?: { limit?: number; offset?: number }) {
      const limit = opts?.limit ?? 50;
      const offset = opts?.offset ?? 0;
      const rows = await db.select().from(companies).limit(limit).offset(offset);
      return rows;
    },

    async getById(id: string) {
      const rows = await db.select().from(companies).where(eq(companies.id, id));
      const row = rows[0];
      if (!row) throw new NotFoundError(`Company ${id} not found`);
      return row;
    },

    async create(input: CreateCompanyInput) {
      const rows = await db
        .insert(companies)
        .values({
          name: input.name,
          description: input.description ?? null,
        })
        .returning();
      const row = rows[0];
      if (!row) throw new ConflictError('Failed to create company');
      await activityService(db).log({
        companyId: row.id,
        actorType: 'system',
        action: 'company.created',
        entityType: 'company',
        entityId: row.id,
        metadata: { name: row.name },
      });
      return row;
    },

    async update(id: string, input: UpdateCompanyInput) {
      const rows = await db
        .update(companies)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(companies.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Company ${id} not found`);
      return row;
    },

    async remove(id: string) {
      const rows = await db
        .delete(companies)
        .where(eq(companies.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Company ${id} not found`);
      return row;
    },
  };
}
