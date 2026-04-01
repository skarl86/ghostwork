/**
 * boardMutationGuard — blocks mutating requests from non-loopback IPs in local_trusted mode.
 */

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { AppConfig } from '../config.js';
import { isLoopback } from './actor.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const guardPlugin: FastifyPluginAsync<{ config: AppConfig }> = async (app, opts) => {
  const { config } = opts;

  if (config.mode !== 'local_trusted') return;

  app.addHook('preHandler', async (request, reply) => {
    if (MUTATING_METHODS.has(request.method) && !isLoopback(request.ip)) {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Write access is restricted to loopback in local_trusted mode',
        },
      });
    }
  });
};

export default fp(guardPlugin, {
  name: 'boardMutationGuard',
  dependencies: ['actor'],
});
