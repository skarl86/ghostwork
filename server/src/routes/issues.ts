/**
 * Issues routes — /api/issues
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '@ghostwork/db';
import { issueService } from '../services/issues.js';
import { checkoutIssue, releaseAndPromote } from '../heartbeat/checkout.js';
import { requireActor } from '../hooks/require-actor.js';

const ISSUE_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'closed', 'cancelled'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

const createBody = z.object({
  companyId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullish(),
  projectId: z.string().uuid().nullish(),
  goalId: z.string().uuid().nullish(),
  status: z.enum(ISSUE_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeAgentId: z.string().uuid().nullish(),
});

const updateBody = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).nullish(),
  status: z.enum(ISSUE_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeAgentId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  goalId: z.string().uuid().nullish(),
});

const idParams = z.object({ issueId: z.string().uuid() });

const listQuery = z.object({
  companyId: z.string().uuid().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assigneeAgentId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const checkoutBody = z.object({
  agentId: z.string().uuid(),
  runId: z.string().uuid(),
});

export const issueRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;
  const svc = issueService(db);

  app.get('/issues', { schema: { querystring: listQuery }, preHandler: [requireActor] }, async (request) => {
    const query = listQuery.parse(request.query);
    return svc.list({
      companyId: query.companyId,
      status: query.status,
      priority: query.priority,
      assigneeAgentId: query.assigneeAgentId,
      parentId: query.parentId,
      limit: query.limit,
      offset: query.offset,
    });
  });

  app.get('/issues/:issueId', { schema: { params: idParams }, preHandler: [requireActor] }, async (request) => {
    const { issueId } = idParams.parse(request.params);
    return svc.getById(issueId);
  });

  app.post('/issues', { schema: { body: createBody }, preHandler: [requireActor] }, async (request, reply) => {
    const body = createBody.parse(request.body);
    const result = await svc.create(body);
    return reply.code(201).send(result);
  });

  app.patch('/issues/:issueId', { schema: { params: idParams, body: updateBody }, preHandler: [requireActor] }, async (request) => {
    const { issueId } = idParams.parse(request.params);
    const body = updateBody.parse(request.body);
    return svc.update(issueId, body);
  });

  app.delete('/issues/:issueId', { schema: { params: idParams }, preHandler: [requireActor] }, async (request) => {
    const { issueId } = idParams.parse(request.params);
    return svc.remove(issueId);
  });

  // ── Checkout / Release ──

  app.post('/issues/:issueId/checkout', { preHandler: [requireActor] }, async (request, reply) => {
    const { issueId } = idParams.parse(request.params);
    const body = checkoutBody.parse(request.body);
    const result = await checkoutIssue(db, issueId, body.agentId, body.runId);
    return reply.code(200).send(result);
  });

  app.post('/issues/:issueId/release', { preHandler: [requireActor] }, async (request, reply) => {
    const { issueId } = idParams.parse(request.params);
    const promotedIds = await releaseAndPromote(db, issueId);
    return reply.code(200).send({ released: true, promotedRunIds: promotedIds });
  });

  // ── Reject & Retry ──

  const rejectBody = z.object({ reason: z.string().min(1) });

  app.post('/issues/:issueId/reject', { preHandler: [requireActor] }, async (request, reply) => {
    const { issueId } = idParams.parse(request.params);
    const { reason } = rejectBody.parse(request.body);
    const svc = issueService(db);

    // Reset main issue to backlog
    const updated = await svc.update(issueId, {
      status: 'backlog',
      executionRunId: null,
      executionLockedAt: null,
    } as Record<string, unknown>);

    // Cancel all sub-issues
    const allIssues = await svc.list({ companyId: updated.companyId, parentId: issueId });
    for (const sub of allIssues) {
      if (sub.status !== 'cancelled' && sub.status !== 'done') {
        await svc.update(sub.id, { status: 'cancelled' });
      }
    }

    return reply.code(200).send({ rejected: true, reason, cancelledSubIssues: allIssues.length });
  });

  // ── Completion Report ──

  app.get('/issues/:issueId/report', { preHandler: [requireActor] }, async (request, reply) => {
    const { issueId } = idParams.parse(request.params);
    const svc = issueService(db);
    const issue = await svc.getById(issueId);
    if (!issue) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Issue not found' } });

    // Get sub-issues
    const subIssues = await svc.list({ companyId: issue.companyId, parentId: issueId });

    // For each sub-issue, get the latest run summary
    const { heartbeatRuns, agents } = await import('@ghostwork/db');
    const { eq, and, desc } = await import('drizzle-orm');

    const subtaskReports = [];
    for (const sub of subIssues) {
      // Find latest succeeded run for this sub-issue
      const runs = await db
        .select({ summary: heartbeatRuns.summary, agentId: heartbeatRuns.agentId })
        .from(heartbeatRuns)
        .where(and(eq(heartbeatRuns.taskId, sub.id), eq(heartbeatRuns.status, 'succeeded')))
        .orderBy(desc(heartbeatRuns.completedAt))
        .limit(1);

      const run = runs[0];
      let agentName = 'Unknown';
      if (run) {
        const agentRows = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, run.agentId));
        agentName = agentRows[0]?.name ?? 'Unknown';
      }

      subtaskReports.push({
        title: sub.title,
        status: sub.status,
        agentName,
        summary: run?.summary ?? 'No summary available',
      });
    }

    // Count total runs for this issue and sub-issues
    const allIssueIds = [issueId, ...subIssues.map((s) => s.id)];
    let totalRuns = 0;
    for (const iid of allIssueIds) {
      const countRows = await db
        .select({ id: heartbeatRuns.id })
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.taskId, iid));
      totalRuns += countRows.length;
    }

    return reply.code(200).send({
      issueTitle: issue.title,
      status: issue.status,
      completedAt: issue.completedAt ?? issue.updatedAt,
      subtasks: subtaskReports,
      totalRuns,
    });
  });
};
