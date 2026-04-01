/**
 * Per-file test setup — connects to the PG started by globalSetup.
 */

import { createDb } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';

const DB_URL = 'postgresql://postgres:postgres@localhost:15498/ghostwork_test';

let _db: Db | null = null;
let _clientEnd: (() => Promise<void>) | null = null;

export function getTestDb(): Db {
  if (!_db) {
    const { db, client } = createDb(DB_URL);
    _db = db;
    _clientEnd = async () => {
      await client.end();
    };
  }
  return _db;
}

export async function cleanupTestDb(): Promise<void> {
  if (_clientEnd) {
    await _clientEnd();
    _clientEnd = null;
    _db = null;
  }
}
