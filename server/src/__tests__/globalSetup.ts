/**
 * Global setup for server integration tests.
 * Starts an embedded PG instance on port 15498, runs migrations, and tears down after all tests.
 */

import EmbeddedPostgres from 'embedded-postgres';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDb, applyPendingMigrations } from '@ghostwork/db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', '..', '.test-pg');
const PORT = 15498;
const DB_URL = `postgresql://postgres:postgres@localhost:${PORT}/ghostwork_test`;

let pg: EmbeddedPostgres;

export async function setup() {
  const isInitialized = fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));

  pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: true,
  });

  if (!isInitialized) {
    await pg.initialise();
  }

  await pg.start();

  try {
    await pg.createDatabase('ghostwork_test');
  } catch {
    // Already exists
  }

  // Run migrations
  const { db, client } = createDb(DB_URL);
  await applyPendingMigrations(db);
  await client.end();
}

export async function teardown() {
  if (pg) {
    await pg.stop();
  }
}
