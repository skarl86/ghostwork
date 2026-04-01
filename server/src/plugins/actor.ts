/**
 * Actor plugin — determines the identity of each request.
 */

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { AppConfig } from '../config.js';
import type { Db } from '@ghostwork/db';
import { verifyAgentToken } from '../auth/jwt.js';
import { createAuthService } from '../auth/better-auth.js';
import { createBoardApiKeyStore } from '../auth/api-keys.js';

// ── Types ──

export type Actor =
  | { type: 'none'; source: 'none' }
  | {
      type: 'board';
      userId: string;
      isInstanceAdmin: boolean;
      source: 'local_implicit' | 'session' | 'board_key';
    }
  | {
      type: 'agent';
      agentId: string;
      companyId: string;
      source: 'agent_jwt' | 'agent_key';
    };

// ── Fastify augmentation ──

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null;
  }
}

// ── Helpers ──

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLoopback(ip: string): boolean {
  return LOOPBACK_IPS.has(ip);
}

// ── Plugin ──

const actorPlugin: FastifyPluginAsync<{ config: AppConfig; db?: Db }> = async (app, opts) => {
  const { config } = opts;

  // Build auth helpers when DB is available
  const db = opts.db;
  const authService = db
    ? createAuthService(db, {
        secret: process.env['GHOSTWORK_AUTH_SECRET'] || 'dev-auth-secret',
      })
    : null;
  const apiKeyStore = db ? createBoardApiKeyStore(db) : null;

  app.decorateRequest<Actor | null>('actor', null);

  app.addHook('onRequest', async (request) => {
    if (config.mode === 'local_trusted') {
      if (isLoopback(request.ip)) {
        request.actor = {
          type: 'board',
          userId: 'local-board',
          isInstanceAdmin: true,
          source: 'local_implicit',
        };
      } else {
        request.actor = { type: 'none', source: 'none' };
      }
      return;
    }

    // authenticated mode — check for agent JWT in Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ') && config.agentJwtSecret) {
      const token = authHeader.slice(7);

      // Try agent JWT first
      try {
        const payload = verifyAgentToken(token, config.agentJwtSecret);
        request.actor = {
          type: 'agent',
          agentId: payload.sub,
          companyId: payload.company_id,
          source: 'agent_jwt',
        };
        return;
      } catch {
        // Not an agent JWT — try session token
      }

      // Try session token
      if (authService) {
        const session = await authService.getSession(token);
        if (session) {
          request.actor = {
            type: 'board',
            userId: session.userId,
            isInstanceAdmin: false,
            source: 'session',
          };
          return;
        }
      }
    }

    // Try board API key (also Bearer token or x-api-key header)
    if (apiKeyStore) {
      const apiKey =
        (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null) ??
        (request.headers['x-api-key'] as string | undefined) ??
        null;

      if (apiKey?.startsWith('pb_')) {
        const result = await apiKeyStore.verify(apiKey);
        if (result) {
          request.actor = {
            type: 'board',
            userId: result.userId,
            isInstanceAdmin: false,
            source: 'board_key',
          };
          return;
        }
      }
    }

    request.actor = { type: 'none', source: 'none' };
  });
};

export default fp(actorPlugin, {
  name: 'actor',
});
