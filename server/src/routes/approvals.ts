/**
 * Approval routes — /api/approvals
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '@ghostwork/db';
import { approvalService } from '../services/approvals.js';
import { requireActor } from '../hooks/require-actor.js';

const createBody = z.object({
  companyId: z.string().uuid(),
  type: z.enum(['new_agent_hire', 'budget_override_required']),
  requestedByAgentId: z.string().uuid().nullish(),
  requestedByUserId: z.string().nullish(),
  payload: z.unknown().optional(),
});

const decideBody = z.object({
  status: z.enum(['approved', 'rejected', 'revision_requested']),
  decidedByUserId: z.string(),
  decisionNote: z.string().optional(),
});

const commentBody = z.object({
  body: z.string().min(1).max(10000),
  authorUserId: z.string().nullish(),
  authorAgentId: z.string().uuid().nullish(),
});

const idParams = z.object({ approvalId: z.string().uuid() });

const listQuery = z.object({
  companyId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const approvalRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;
  const svc = approvalService(db);

  app.get('/approvals', { preHandler: [requireActor] }, async (request) => {
    const query = listQuery.parse(request.query);
    return svc.list(query.companyId, query.limit, query.offset);
  });

  app.get('/approvals/:approvalId', { preHandler: [requireActor] }, async (request) => {
    const { approvalId } = idParams.parse(request.params);
    return svc.getById(approvalId);
  });

  app.post('/approvals', { preHandler: [requireActor] }, async (request, reply) => {
    const body = createBody.parse(request.body);
    const result = await svc.create(body);
    return reply.code(201).send(result);
  });

  app.patch('/approvals/:approvalId', { preHandler: [requireActor] }, async (request) => {
    const { approvalId } = idParams.parse(request.params);
    const body = decideBody.parse(request.body);
    return svc.decide(approvalId, body);
  });

  // ── Comments ──

  app.get('/approvals/:approvalId/comments', { preHandler: [requireActor] }, async (request) => {
    const { approvalId } = idParams.parse(request.params);
    return svc.listComments(approvalId);
  });

  app.post('/approvals/:approvalId/comments', { preHandler: [requireActor] }, async (request, reply) => {
    const { approvalId } = idParams.parse(request.params);
    const body = commentBody.parse(request.body);
    const result = await svc.addComment({ ...body, approvalId });
    return reply.code(201).send(result);
  });
};
