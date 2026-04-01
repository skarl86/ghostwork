/**
 * Secret management routes — /api/secrets
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '@ghostwork/db';
import { secretService } from '../services/secrets.js';
import { requireActor } from '../hooks/require-actor.js';

const createBody = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1).max(200),
  value: z.string().min(1),
});

const idParams = z.object({ secretId: z.string().uuid() });

const listQuery = z.object({
  companyId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const secretRoutes: FastifyPluginAsync<{ db: Db; encryptionKey: string }> = async (
  app,
  opts,
) => {
  const { db, encryptionKey } = opts;
  const svc = secretService(db, encryptionKey);

  app.get('/secrets', { preHandler: [requireActor] }, async (request) => {
    const query = listQuery.parse(request.query);
    // Returns metadata only — no decrypted values
    return svc.list(query.companyId, query.limit, query.offset);
  });

  app.post('/secrets', { preHandler: [requireActor] }, async (request, reply) => {
    const body = createBody.parse(request.body);
    const result = await svc.create(body);
    return reply.code(201).send(result);
  });

  app.delete('/secrets/:secretId', { preHandler: [requireActor] }, async (request) => {
    const { secretId } = idParams.parse(request.params);
    return svc.remove(secretId);
  });
};
