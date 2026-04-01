import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, '..', 'drizzle');

/**
 * Inspects which migrations have been applied and which are pending.
 */
export async function inspectMigrations(db: Db) {
  try {
    const result = await db.execute<{ id: number; hash: string; created_at: string }>(
      'SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id',
    );
    return {
      applied: result,
      migrationsFolder,
    };
  } catch {
    // Migration table doesn't exist yet
    return {
      applied: [],
      migrationsFolder,
    };
  }
}

/**
 * Applies all pending migrations.
 */
export async function applyPendingMigrations(db: Db) {
  await migrate(db, { migrationsFolder });
}
