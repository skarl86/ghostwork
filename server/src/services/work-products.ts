/**
 * Work product service — CRUD for issue work products (PRs, branches, previews, etc.).
 */

import { and, desc, eq } from 'drizzle-orm';
import { issueWorkProducts } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';

type WorkProductRow = typeof issueWorkProducts.$inferSelect;
type WorkProductInsert = typeof issueWorkProducts.$inferInsert;

export function workProductService(db: Db) {
  return {
    async listForIssue(issueId: string) {
      return db
        .select()
        .from(issueWorkProducts)
        .where(eq(issueWorkProducts.issueId, issueId))
        .orderBy(desc(issueWorkProducts.isPrimary), desc(issueWorkProducts.updatedAt));
    },

    async getById(id: string): Promise<WorkProductRow | null> {
      const rows = await db
        .select()
        .from(issueWorkProducts)
        .where(eq(issueWorkProducts.id, id));
      return rows[0] ?? null;
    },

    async createForIssue(
      issueId: string,
      companyId: string,
      data: Omit<WorkProductInsert, 'issueId' | 'companyId'>,
    ): Promise<WorkProductRow | null> {
      return db.transaction(async (tx) => {
        // If this is marked primary, unset other primaries of the same type
        if (data.isPrimary) {
          await tx
            .update(issueWorkProducts)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(
              and(
                eq(issueWorkProducts.companyId, companyId),
                eq(issueWorkProducts.issueId, issueId),
                eq(issueWorkProducts.type, data.type),
              ),
            );
        }

        const rows = await tx
          .insert(issueWorkProducts)
          .values({ ...data, companyId, issueId })
          .returning();
        return rows[0] ?? null;
      });
    },

    async update(
      id: string,
      patch: Partial<WorkProductInsert>,
    ): Promise<WorkProductRow | null> {
      return db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(issueWorkProducts)
          .where(eq(issueWorkProducts.id, id))
          .then((rows) => rows[0] ?? null);
        if (!existing) return null;

        // If marking as primary, unset other primaries of the same type
        if (patch.isPrimary === true) {
          await tx
            .update(issueWorkProducts)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(
              and(
                eq(issueWorkProducts.companyId, existing.companyId),
                eq(issueWorkProducts.issueId, existing.issueId),
                eq(issueWorkProducts.type, existing.type),
              ),
            );
        }

        const rows = await tx
          .update(issueWorkProducts)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(issueWorkProducts.id, id))
          .returning();
        return rows[0] ?? null;
      });
    },

    async remove(id: string): Promise<WorkProductRow | null> {
      const rows = await db
        .delete(issueWorkProducts)
        .where(eq(issueWorkProducts.id, id))
        .returning();
      return rows[0] ?? null;
    },
  };
}
