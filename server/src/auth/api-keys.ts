/**
 * Board API Keys — DB-backed key generation & verification.
 *
 * SHA-256 hash storage — stores only the hash, returns plaintext once on generate.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { boardApiKeys } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';

// ── Types ──

export interface BoardApiKey {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface BoardApiKeyStore {
  generate(userId: string, name: string): Promise<{ key: string; record: BoardApiKey }>;
  verify(key: string): Promise<{ userId: string; keyId: string } | null>;
  list(userId: string): Promise<Array<Omit<BoardApiKey, 'keyHash'>>>;
  revoke(keyId: string, userId: string): Promise<boolean>;
}

// ── Constants ──

const KEY_PREFIX = 'pb_';
const KEY_LENGTH = 32;
const HMAC_SECRET = 'ghostwork-board-keys';

function hashKey(key: string): string {
  return createHmac('sha256', HMAC_SECRET).update(key).digest('hex');
}

// ── DB-backed Store ──

export function createBoardApiKeyStore(db: Db): BoardApiKeyStore {
  return {
    async generate(userId, name) {
      const rawKey = KEY_PREFIX + randomBytes(KEY_LENGTH).toString('hex');
      const keyHashValue = hashKey(rawKey);
      const prefix = rawKey.slice(0, 10) + '...';

      const rows = await db
        .insert(boardApiKeys)
        .values({
          userId,
          name,
          keyHash: keyHashValue,
          prefix,
        })
        .returning();
      const row = rows[0]!;

      const record: BoardApiKey = {
        id: row.id,
        userId: row.userId,
        name: row.name,
        keyHash: row.keyHash,
        prefix: row.prefix,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      };

      return { key: rawKey, record };
    },

    async verify(key) {
      const hash = hashKey(key);
      const rows = await db
        .select()
        .from(boardApiKeys)
        .where(eq(boardApiKeys.keyHash, hash));
      const row = rows[0];
      if (!row) return null;

      // Update lastUsedAt
      await db
        .update(boardApiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(boardApiKeys.id, row.id));

      return { userId: row.userId, keyId: row.id };
    },

    async list(userId) {
      const rows = await db
        .select()
        .from(boardApiKeys)
        .where(eq(boardApiKeys.userId, userId));

      return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        name: row.name,
        prefix: row.prefix,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      }));
    },

    async revoke(keyId, userId) {
      const rows = await db
        .select()
        .from(boardApiKeys)
        .where(eq(boardApiKeys.id, keyId));
      const row = rows[0];
      if (!row || row.userId !== userId) return false;

      await db.delete(boardApiKeys).where(eq(boardApiKeys.id, keyId));
      return true;
    },
  };
}
