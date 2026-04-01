/**
 * Agent service — CRUD operations for agents.
 */

import { eq } from 'drizzle-orm';
import { agents } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { NotFoundError, ConflictError } from '../errors.js';
import { activityService } from './activity.js';

export interface CreateAgentInput {
  companyId: string;
  name: string;
  role?: string;
  title?: string | null;
  reportsTo?: string | null;
  adapterType: string;
  adapterConfig?: unknown;
  runtimeConfig?: unknown;
}

export interface UpdateAgentInput {
  name?: string;
  role?: string;
  title?: string | null;
  reportsTo?: string | null;
  status?: string;
  adapterType?: string;
  adapterConfig?: unknown;
  runtimeConfig?: unknown;
}

export function agentService(db: Db) {
  return {
    async list(opts?: { companyId?: string; limit?: number; offset?: number }) {
      const limit = opts?.limit ?? 50;
      const offset = opts?.offset ?? 0;

      if (opts?.companyId) {
        return db
          .select()
          .from(agents)
          .where(eq(agents.companyId, opts.companyId))
          .limit(limit)
          .offset(offset);
      }
      return db.select().from(agents).limit(limit).offset(offset);
    },

    async getById(id: string) {
      const rows = await db.select().from(agents).where(eq(agents.id, id));
      const row = rows[0];
      if (!row) throw new NotFoundError(`Agent ${id} not found`);
      return row;
    },

    async create(input: CreateAgentInput) {
      const rows = await db
        .insert(agents)
        .values({
          companyId: input.companyId,
          name: input.name,
          role: input.role ?? 'general',
          title: input.title ?? null,
          reportsTo: input.reportsTo ?? null,
          adapterType: input.adapterType,
          adapterConfig: input.adapterConfig ?? null,
          runtimeConfig: input.runtimeConfig ?? null,
        })
        .returning();
      const row = rows[0];
      if (!row) throw new ConflictError('Failed to create agent');
      await activityService(db).log({
        companyId: input.companyId,
        actorType: 'system',
        action: 'agent.created',
        entityType: 'agent',
        entityId: row.id,
        metadata: { name: row.name, role: row.role },
      });
      return row;
    },

    async update(id: string, input: UpdateAgentInput) {
      const rows = await db
        .update(agents)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(agents.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Agent ${id} not found`);
      return row;
    },

    async remove(id: string) {
      const rows = await db
        .delete(agents)
        .where(eq(agents.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Agent ${id} not found`);
      return row;
    },
  };
}
