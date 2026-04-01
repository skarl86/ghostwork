/**
 * Activity Log service — log and query activity entries.
 */

import { eq, and, desc } from 'drizzle-orm';
import { activityLog } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';

export interface LogActivityParams {
  companyId: string;
  actorType?: string | null;
  actorId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: unknown | null;
}

export interface ListActivityParams {
  companyId: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
}

export function activityService(db: Db) {
  return {
    async log(params: LogActivityParams) {
      const rows = await db
        .insert(activityLog)
        .values({
          companyId: params.companyId,
          actorType: params.actorType ?? null,
          actorId: params.actorId ?? null,
          action: params.action,
          entityType: params.entityType ?? null,
          entityId: params.entityId ?? null,
          metadata: params.metadata ?? null,
          createdAt: new Date(),
        })
        .returning();
      return rows[0]!;
    },

    async list(params: ListActivityParams) {
      const limit = params.limit ?? 50;
      const offset = params.offset ?? 0;
      const conditions = [eq(activityLog.companyId, params.companyId)];

      if (params.entityType) {
        conditions.push(eq(activityLog.entityType, params.entityType));
      }
      if (params.entityId) {
        conditions.push(eq(activityLog.entityId, params.entityId));
      }

      return db
        .select()
        .from(activityLog)
        .where(and(...conditions))
        .orderBy(desc(activityLog.createdAt))
        .limit(limit)
        .offset(offset);
    },
  };
}
