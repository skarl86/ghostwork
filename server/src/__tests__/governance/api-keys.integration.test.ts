/**
 * Board API Key tests — DB-backed.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDb, cleanupTestDb } from '../setup.js';
import { createBoardApiKeyStore, type BoardApiKeyStore } from '../../auth/api-keys.js';
import { createAuthService } from '../../auth/better-auth.js';

afterAll(async () => {
  await cleanupTestDb();
}, 30_000);

describe('BoardApiKeyStore (DB)', () => {
  let store: BoardApiKeyStore;
  let userId: string;

  beforeAll(async () => {
    const db = await getTestDb();
    store = createBoardApiKeyStore(db);

    // Create a real user to associate keys with
    const auth = createAuthService(db, { secret: 'test' });
    const { user } = await auth.signup(
      `apikey-test-${Date.now()}@test.com`,
      'pass',
    );
    userId = user.id;
  }, 60_000);

  it('should generate a key with pb_ prefix', async () => {
    const { key, record } = await store.generate(userId, 'My Key');
    expect(key).toMatch(/^pb_/);
    expect(record.userId).toBe(userId);
    expect(record.name).toBe('My Key');
    expect(record.prefix).toMatch(/^pb_/);
    expect(record.createdAt).toBeDefined();
  });

  it('should verify a valid key', async () => {
    const { key } = await store.generate(userId, 'Test Key');
    const result = await store.verify(key);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe(userId);
  });

  it('should return null for invalid key', async () => {
    const result = await store.verify('pb_invalid_key');
    expect(result).toBeNull();
  });

  it('should list keys for a user (without hash)', async () => {
    // Create a second user for isolation
    const db = await getTestDb();
    const auth = createAuthService(db, { secret: 'test' });
    const { user: user2 } = await auth.signup(
      `apikey-list-${Date.now()}@test.com`,
      'pass',
    );

    const store2 = createBoardApiKeyStore(db);
    await store2.generate(user2.id, 'Key A');
    await store2.generate(user2.id, 'Key B');

    const list = await store2.list(user2.id);
    expect(list.length).toBeGreaterThanOrEqual(2);
    // Should not expose keyHash
    for (const item of list) {
      expect(
        (item as Record<string, unknown>)['keyHash'],
      ).toBeUndefined();
    }
  });

  it('should revoke a key', async () => {
    const { key, record } = await store.generate(userId, 'Revocable');
    const revoked = await store.revoke(record.id, userId);
    expect(revoked).toBe(true);

    // Key should no longer verify
    const result = await store.verify(key);
    expect(result).toBeNull();
  });

  it("should not revoke another user's key", async () => {
    const { record } = await store.generate(userId, 'Protected');
    const revoked = await store.revoke(
      record.id,
      '00000000-0000-0000-0000-000000000099',
    );
    expect(revoked).toBe(false);
  });

  it('should update lastUsedAt on verify', async () => {
    const { key, record } = await store.generate(userId, 'Tracked');
    expect(record.lastUsedAt).toBeNull();

    await store.verify(key);

    const list = await store.list(userId);
    const updated = list.find((k) => k.id === record.id);
    expect(updated?.lastUsedAt).not.toBeNull();
  });
});
