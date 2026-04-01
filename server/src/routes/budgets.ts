/**
 * Budget policy routes — /api/budget-policies
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '@ghostwork/db';
import { budgetService } from '../services/budgets.js';
import { requireActor } from '../hooks/require-actor.js';

const createBody = z.object({
  companyId: z.string().uuid(),
  scopeType: z.enum(['company', 'agent', 'project']),
  scopeId: z.string().uuid().nullish(),
  metric: z.string().optional(),
  windowKind: z.enum(['monthly', 'lifetime']),
  amount: z.number().int().min(0),
  warnPercent: z.number().int().min(0).max(100).optional(),
  hardStopEnabled: z.boolean().optional(),
  notifyEnabled: z.boolean().optional(),
});

const updateBody = z.object({
  amount: z.number().int().min(0).optional(),
  warnPercent: z.number().int().min(0).max(100).optional(),
  hardStopEnabled: z.boolean().optional(),
  notifyEnabled: z.boolean().optional(),
  windowKind: z.enum(['monthly', 'lifetime']).optional(),
});

const idParams = z.object({ policyId: z.string().uuid() });

const listQuery = z.object({
  companyId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const checkQuery = z.object({
  companyId: z.string().uuid(),
  agentId: z.string().uuid(),
});

export const budgetRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;
  const svc = budgetService(db);

  app.get('/budget-policies', { preHandler: [requireActor] }, async (request) => {
    const query = listQuery.parse(request.query);
    return svc.list(query.companyId, query.limit, query.offset);
  });

  app.get('/budget-policies/:policyId', { preHandler: [requireActor] }, async (request) => {
    const { policyId } = idParams.parse(request.params);
    return svc.getById(policyId);
  });

  app.post('/budget-policies', { preHandler: [requireActor] }, async (request, reply) => {
    const body = createBody.parse(request.body);
    const result = await svc.create(body);
    return reply.code(201).send(result);
  });

  app.patch('/budget-policies/:policyId', { preHandler: [requireActor] }, async (request) => {
    const { policyId } = idParams.parse(request.params);
    const body = updateBody.parse(request.body);
    return svc.update(policyId, body);
  });

  app.delete('/budget-policies/:policyId', { preHandler: [requireActor] }, async (request) => {
    const { policyId } = idParams.parse(request.params);
    return svc.remove(policyId);
  });

  // Budget check endpoint
  app.get('/budget-policies/check', { preHandler: [requireActor] }, async (request) => {
    const query = checkQuery.parse(request.query);
    return svc.checkBudget(query.companyId, query.agentId);
  });
};
