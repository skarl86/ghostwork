/**
 * @ghostwork/db — Database schema, client, and utilities
 */

// Schema exports
export * from './schema/index.js';

// Client
export { createDb } from './client.js';
export type { Db } from './client.js';

// Embedded PostgreSQL
export { getConnectionUrl } from './embedded.js';
export type { EmbeddedPgResult } from './embedded.js';

// Migration helpers
export { inspectMigrations, applyPendingMigrations } from './migrate.js';

// Type inference helpers
export { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
