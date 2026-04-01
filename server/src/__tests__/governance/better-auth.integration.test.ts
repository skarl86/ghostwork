/**
 * BetterAuth — DB-backed session tests.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, cleanupTestDb } from '../setup.js';
import { createAuthService } from '../../auth/better-auth.js';
import { hashPassword, verifyPassword } from '../../auth/better-auth.js';

afterAll(async () => {
  await cleanupTestDb();
}, 30_000);

describe('Password Hashing', () => {
  it('should hash and verify a password', () => {
    const stored = hashPassword('my-secret-123');
    expect(stored).toContain(':');
    expect(verifyPassword('my-secret-123', stored)).toBe(true);
  });

  it('should reject wrong password', () => {
    const stored = hashPassword('correct-pass');
    expect(verifyPassword('wrong-pass', stored)).toBe(false);
  });

  it('should produce different hashes for same password (random salt)', () => {
    const a = hashPassword('same-pass');
    const b = hashPassword('same-pass');
    expect(a).not.toBe(b);
  });
});

describe('BetterAuth DB Service', () => {
  const config = { secret: 'test-secret-key' };
  let db: ReturnType<typeof getTestDb>;

  beforeAll(async () => {
    db = await getTestDb();
  }, 60_000);

  beforeEach(async () => {
    // Clean up only our test data (prefixed with 'dbauth-') to avoid breaking other test suites
    await db.execute(sql`DELETE FROM board_sessions WHERE user_id IN (SELECT id FROM board_users WHERE email LIKE 'dbauth-%')`);
    await db.execute(sql`DELETE FROM board_api_keys_v2 WHERE user_id IN (SELECT id FROM board_users WHERE email LIKE 'dbauth-%')`);
    await db.execute(sql`DELETE FROM board_users WHERE email LIKE 'dbauth-%'`);
  });

  it('should signup a new user', async () => {
    const auth = createAuthService(db, config);
    const result = await auth.signup('dbauth-user@test.com', 'password123', 'Test User');

    expect(result.token).toBeDefined();
    expect(result.token.length).toBe(64); // 32 bytes hex
    expect(result.user.email).toBe('dbauth-user@test.com');
    expect(result.user.name).toBe('Test User');
    expect(result.user.id).toBeDefined();
    expect(result.user.createdAt).toBeDefined();
  });

  it('should signin with correct credentials', async () => {
    const auth = createAuthService(db, config);
    await auth.signup('dbauth-signin@test.com', 'pass123');

    const result = await auth.signin('dbauth-signin@test.com', 'pass123');
    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('dbauth-signin@test.com');
  });

  it('should reject signin with wrong password', async () => {
    const auth = createAuthService(db, config);
    await auth.signup('dbauth-wrong@test.com', 'correct-pass');

    await expect(
      auth.signin('dbauth-wrong@test.com', 'wrong-pass'),
    ).rejects.toThrow('Invalid credentials');
  });

  it('should reject signin for nonexistent user', async () => {
    const auth = createAuthService(db, config);
    await expect(
      auth.signin('dbauth-nobody@test.com', 'pass'),
    ).rejects.toThrow('Invalid credentials');
  });

  it('should reject duplicate signup', async () => {
    const auth = createAuthService(db, config);
    await auth.signup('dbauth-dup@test.com', 'pass1');
    await expect(
      auth.signup('dbauth-dup@test.com', 'pass2'),
    ).rejects.toThrow('User already exists');
  });

  it('should create and validate session', async () => {
    const auth = createAuthService(db, config);
    const { token } = await auth.signup('dbauth-session@test.com', 'pass');

    const session = await auth.getSession(token);
    expect(session).not.toBeNull();
    expect(session!.email).toBe('dbauth-session@test.com');
    expect(session!.expiresAt).toBeGreaterThan(Date.now());
  });

  it('should invalidate session on signout', async () => {
    const auth = createAuthService(db, config);
    const { token } = await auth.signup('dbauth-signout@test.com', 'pass');

    await auth.signout(token);

    const session = await auth.getSession(token);
    expect(session).toBeNull();
  });

  it('should expire sessions after maxAge', async () => {
    // Create service with 0 second max age (expires immediately)
    const auth = createAuthService(db, { ...config, sessionMaxAge: 0 });
    const { token } = await auth.signup('dbauth-expire@test.com', 'pass');

    // Wait a tiny bit to ensure expiration
    await new Promise((r) => setTimeout(r, 10));

    const session = await auth.getSession(token);
    expect(session).toBeNull();
  });

  it('should get user by id', async () => {
    const auth = createAuthService(db, config);
    const { user } = await auth.signup('dbauth-getuser@test.com', 'pass');

    const found = await auth.getUser(user.id);
    expect(found).not.toBeNull();
    expect(found!.email).toBe('dbauth-getuser@test.com');
    // Should not expose password hash
    expect(
      (found as unknown as Record<string, unknown>)['passwordHash'],
    ).toBeUndefined();
  });

  it('should return null for nonexistent user id', async () => {
    const auth = createAuthService(db, config);
    const found = await auth.getUser('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });
});
