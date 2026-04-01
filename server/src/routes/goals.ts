/**
 * Goals routes — /api/goals
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '@ghostwork/db';
import { goalService } from '../services/goals.js';
import { requireActor } from '../hooks/require-actor.js';

const createBody = z.object({
  companyId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).nullish(),
  level: z.string().min(1),
  status: z.string().optional(),
  parentId: z.string().uuid().nullish(),
  ownerAgentId: z.string().uuid().nullish(),
});

const updateBody = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullish(),
  level: z.string().min(1).optional(),
  status: z.string().optional(),
  parentId: z.string().uuid().nullish(),
  ownerAgentId: z.string().uuid().nullish(),
});

const idParams = z.object({ goalId: z.string().uuid() });

const listQuery = z.object({
  companyId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const goalRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;
  const svc = goalService(db);

  app.get('/goals', { schema: { querystring: listQuery }, preHandler: [requireActor] }, async (request) => {
    const query = listQuery.parse(request.query);
    return svc.list({ companyId: query.companyId, limit: query.limit, offset: query.offset });
  });

  app.get('/goals/:goalId', { schema: { params: idParams }, preHandler: [requireActor] }, async (request) => {
    const { goalId } = idParams.parse(request.params);
    return svc.getById(goalId);
  });

  app.post('/goals', { schema: { body: createBody }, preHandler: [requireActor] }, async (request, reply) => {
    const body = createBody.parse(request.body);
    const result = await svc.create(body);
    return reply.code(201).send(result);
  });

  app.patch('/goals/:goalId', { schema: { params: idParams, body: updateBody }, preHandler: [requireActor] }, async (request) => {
    const { goalId } = idParams.parse(request.params);
    const body = updateBody.parse(request.body);
    return svc.update(goalId, body);
  });

  app.delete('/goals/:goalId', { schema: { params: idParams }, preHandler: [requireActor] }, async (request) => {
    const { goalId } = idParams.parse(request.params);
    return svc.remove(goalId);
  });
};
