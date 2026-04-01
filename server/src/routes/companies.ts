/**
 * Companies routes — /api/companies
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '@ghostwork/db';
import { companyService } from '../services/companies.js';
import { requireActor } from '../hooks/require-actor.js';

const createBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
});

const updateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullish(),
  status: z.string().optional(),
});

const idParams = z.object({ companyId: z.string().uuid() });

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const companyRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;
  const svc = companyService(db);

  app.get('/companies', { schema: { querystring: listQuery }, preHandler: [requireActor] }, async (request) => {
    const query = listQuery.parse(request.query);
    return svc.list({ limit: query.limit, offset: query.offset });
  });

  app.get('/companies/:companyId', { schema: { params: idParams }, preHandler: [requireActor] }, async (request) => {
    const { companyId } = idParams.parse(request.params);
    return svc.getById(companyId);
  });

  app.post('/companies', { schema: { body: createBody }, preHandler: [requireActor] }, async (request, reply) => {
    const body = createBody.parse(request.body);
    const result = await svc.create(body);
    return reply.code(201).send(result);
  });

  app.patch('/companies/:companyId', { schema: { params: idParams, body: updateBody }, preHandler: [requireActor] }, async (request) => {
    const { companyId } = idParams.parse(request.params);
    const body = updateBody.parse(request.body);
    return svc.update(companyId, body);
  });

  app.delete('/companies/:companyId', { schema: { params: idParams }, preHandler: [requireActor] }, async (request) => {
    const { companyId } = idParams.parse(request.params);
    return svc.remove(companyId);
  });
};
