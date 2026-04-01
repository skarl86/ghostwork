/**
 * Agents routes — /api/agents
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '@ghostwork/db';
import { agentService } from '../services/agents.js';
import { requireActor } from '../hooks/require-actor.js';

const createBody = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1).max(200),
  role: z.string().max(100).optional(),
  title: z.string().max(200).nullish(),
  reportsTo: z.string().uuid().nullish(),
  adapterType: z.string().min(1),
  adapterConfig: z.unknown().optional(),
  runtimeConfig: z.unknown().optional(),
});

const updateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.string().max(100).optional(),
  title: z.string().max(200).nullish(),
  reportsTo: z.string().uuid().nullish(),
  status: z.string().optional(),
  adapterType: z.string().min(1).optional(),
  adapterConfig: z.unknown().optional(),
  runtimeConfig: z.unknown().optional(),
});

const idParams = z.object({ agentId: z.string().uuid() });

const listQuery = z.object({
  companyId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const agentRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;
  const svc = agentService(db);

  // List
  app.get('/agents', { schema: { querystring: listQuery }, preHandler: [requireActor] }, async (request) => {
    const query = listQuery.parse(request.query);
    return svc.list({ companyId: query.companyId, limit: query.limit, offset: query.offset });
  });

  // Get by ID
  app.get('/agents/:agentId', { schema: { params: idParams }, preHandler: [requireActor] }, async (request) => {
    const { agentId } = idParams.parse(request.params);
    return svc.getById(agentId);
  });

  // Create
  app.post('/agents', { schema: { body: createBody }, preHandler: [requireActor] }, async (request, reply) => {
    const body = createBody.parse(request.body);
    const result = await svc.create(body);
    return reply.code(201).send(result);
  });

  // Update
  app.patch('/agents/:agentId', { schema: { params: idParams, body: updateBody }, preHandler: [requireActor] }, async (request) => {
    const { agentId } = idParams.parse(request.params);
    const body = updateBody.parse(request.body);
    return svc.update(agentId, body);
  });

  // Delete
  app.delete('/agents/:agentId', { schema: { params: idParams }, preHandler: [requireActor] }, async (request) => {
    const { agentId } = idParams.parse(request.params);
    return svc.remove(agentId);
  });
};
