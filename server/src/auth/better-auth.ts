/**
 * BetterAuth — DB-backed session authentication for Board users.
 *
 * Uses crypto.scrypt for password hashing (no native deps).
 * Sessions stored in `board_sessions` table with 7-day expiry.
 */

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import { boardUsers, boardSessions } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';

// ── Types ──

export interface AuthConfig {
  secret: string;
  sessionMaxAge?: number; // seconds, default 7 days
}

export interface AuthSession {
  id: string;
  userId: string;
  email: string;
  expiresAt: number; // epoch ms
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  createdAt: string;
}

// ── Password Hashing (scrypt) ──

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  const derivedBuf = Buffer.from(derived, 'utf8');
  const hashBuf = Buffer.from(hash, 'utf8');
  if (derivedBuf.length !== hashBuf.length) return false;
  return timingSafeEqual(derivedBuf, hashBuf);
}

// ── Session Token ──

function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

// ── Service ──

const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;

export function createAuthService(db: Db, config: AuthConfig) {
  const maxAge = config.sessionMaxAge ?? SEVEN_DAYS_SEC;

  async function createSession(
    userId: string,
    email: string,
  ): Promise<{ token: string; session: AuthSession }> {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + maxAge * 1000);

    await db.insert(boardSessions).values({
      userId,
      token,
      expiresAt,
    });

    return {
      token,
      session: {
        id: token,
        userId,
        email,
        expiresAt: expiresAt.getTime(),
      },
    };
  }

  return {
    async signup(
      email: string,
      password: string,
      name?: string,
    ): Promise<{ token: string; user: AuthUser }> {
      // Check if user exists
      const existing = await db
        .select()
        .from(boardUsers)
        .where(eq(boardUsers.email, email));
      if (existing.length > 0) {
        throw new Error('User already exists');
      }

      const passwordHashValue = hashPassword(password);
      const rows = await db
        .insert(boardUsers)
        .values({
          email,
          passwordHash: passwordHashValue,
          name: name ?? null,
        })
        .returning();
      const user = rows[0]!;

      const { token } = await createSession(user.id, email);
      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt.toISOString(),
        },
      };
    },

    async signin(
      email: string,
      password: string,
    ): Promise<{ token: string; user: AuthUser }> {
      const rows = await db
        .select()
        .from(boardUsers)
        .where(eq(boardUsers.email, email));
      const user = rows[0];

      if (!user) {
        throw new Error('Invalid credentials');
      }

      if (!verifyPassword(password, user.passwordHash)) {
        throw new Error('Invalid credentials');
      }

      const { token } = await createSession(user.id, email);
      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt.toISOString(),
        },
      };
    },

    async signout(token: string): Promise<void> {
      await db
        .delete(boardSessions)
        .where(eq(boardSessions.token, token));
    },

    async getSession(token: string): Promise<AuthSession | null> {
      const rows = await db
        .select({
          session: boardSessions,
          user: boardUsers,
        })
        .from(boardSessions)
        .innerJoin(boardUsers, eq(boardSessions.userId, boardUsers.id))
        .where(eq(boardSessions.token, token));

      const row = rows[0];
      if (!row) return null;

      const expiresAt = row.session.expiresAt.getTime();
      if (expiresAt < Date.now()) {
        // Clean up expired session
        await db
          .delete(boardSessions)
          .where(eq(boardSessions.token, token));
        return null;
      }

      return {
        id: row.session.id,
        userId: row.user.id,
        email: row.user.email,
        expiresAt,
      };
    },

    async getUser(userId: string): Promise<AuthUser | null> {
      const rows = await db
        .select()
        .from(boardUsers)
        .where(eq(boardUsers.id, userId));
      const user = rows[0];
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
      };
    },

    /** Extract session token from request (cookie or header). */
    extractToken(request: FastifyRequest): string | null {
      const auth = request.headers.authorization;
      if (auth?.startsWith('Bearer ')) {
        return auth.slice(7);
      }
      const cookieHeader = request.headers.cookie;
      if (cookieHeader) {
        const match = cookieHeader.match(/session=([^;]+)/);
        if (match) return match[1]!;
      }
      return null;
    },

    /** Clean up expired sessions (housekeeping). */
    async cleanupExpired(): Promise<number> {
      const result = await db
        .delete(boardSessions)
        .where(lt(boardSessions.expiresAt, new Date()))
        .returning();
      return result.length;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

// ── Auth Routes Plugin ──

export const authRoutes: FastifyPluginAsync<{
  authConfig: AuthConfig;
  db: Db;
}> = async (app, opts) => {
  const auth = createAuthService(opts.db, opts.authConfig);

  app.post('/auth/signup', async (request, reply) => {
    const body = request.body as {
      email: string;
      password: string;
      name?: string;
    };
    try {
      const result = await auth.signup(body.email, body.password, body.name);
      reply.header(
        'set-cookie',
        `session=${result.token}; HttpOnly; Path=/; SameSite=Lax`,
      );
      return result;
    } catch (err) {
      return reply.code(409).send({
        error: err instanceof Error ? err.message : 'Signup failed',
      });
    }
  });

  app.post('/auth/signin', async (request, reply) => {
    const body = request.body as { email: string; password: string };
    try {
      const result = await auth.signin(body.email, body.password);
      reply.header(
        'set-cookie',
        `session=${result.token}; HttpOnly; Path=/; SameSite=Lax`,
      );
      return result;
    } catch (err) {
      reply.code(401);
      return {
        error: err instanceof Error ? err.message : 'Signin failed',
      };
    }
  });

  app.post('/auth/signout', async (request, reply) => {
    const token = auth.extractToken(request);
    if (token) {
      await auth.signout(token);
    }
    reply.header(
      'set-cookie',
      'session=; HttpOnly; Path=/; Max-Age=0',
    );
    return { ok: true };
  });

  app.get('/auth/session', async (request, reply) => {
    const token = auth.extractToken(request);
    if (!token) {
      reply.code(401);
      return { error: 'No session' };
    }
    const session = await auth.getSession(token);
    if (!session) {
      reply.code(401);
      return { error: 'Invalid or expired session' };
    }
    const user = await auth.getUser(session.userId);
    return { session, user };
  });
};
