/**
 * Issues routes — /api/issues
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { type Db } from '@ghostwork/db';
import { issueService } from '../services/issues.js';
import { workProductService } from '../services/work-products.js';
import { checkoutIssue, releaseAndPromote } from '../heartbeat/checkout.js';
import { requireActor } from '../hooks/require-actor.js';
import { cancelRun } from '../heartbeat/cancel.js';
import type { ProcessHandle } from '../heartbeat/types.js';

const ISSUE_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'plan_review', 'plan_rejected', 'done', 'closed', 'cancelled'] as const;
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

const WORK_PRODUCT_TYPES = [
  'pull_request', 'branch', 'preview', 'deployment', 'commit', 'artifact', 'document',
] as const;

const WORK_PRODUCT_STATUSES = [
  'active', 'ready_for_review', 'approved', 'changes_requested',
  'merged', 'closed', 'failed', 'archived', 'draft', 'open',
] as const;

const WORK_PRODUCT_REVIEW_STATES = [
  'none', 'approved', 'changes_requested',
] as const;

const createWorkProductBody = z.object({
  projectId: z.string().uuid().nullish(),
  executionWorkspaceId: z.string().uuid().nullish(),
  type: z.enum(WORK_PRODUCT_TYPES),
  provider: z.string().min(1),
  externalId: z.string().nullish(),
  title: z.string().min(1),
  url: z.string().nullish(),
  status: z.enum(WORK_PRODUCT_STATUSES).default('active'),
  reviewState: z.enum(WORK_PRODUCT_REVIEW_STATES).default('none'),
  isPrimary: z.boolean().default(false),
  healthStatus: z.enum(['unknown', 'healthy', 'unhealthy']).default('unknown'),
  summary: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  createdByRunId: z.string().uuid().nullish(),
});

const updateWorkProductBody = createWorkProductBody.partial();

const workProductIdParams = z.object({ workProductId: z.string().uuid() });

export const issueRoutes: FastifyPluginAsync<{ db: Db; runningProcesses?: Map<string, ProcessHandle> }> = async (app, opts) => {
  const { db, runningProcesses } = opts;
  const svc = issueService(db);
  const wpSvc = workProductService(db);

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

    if (body.status === 'cancelled') {
      const cancelled = await svc.cancelWithCascade(issueId);
      for (const issue of cancelled) {
        if (issue.executionRunId) {
          await cancelRun(db, issue.executionRunId, runningProcesses ?? new Map()).catch(() => undefined);
        }
      }
      return svc.getById(issueId);
    }

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

    // Reset main issue to backlog
    const updated = await svc.update(issueId, {
      status: 'backlog',
      executionRunId: null,
      executionLockedAt: null,
    } as Record<string, unknown>);

    // Recursively delete all sub-issues and stop their active runs
    const children = await svc.list({ companyId: updated.companyId, parentId: issueId, limit: 1000 });
    let deletedCount = 0;
    for (const child of children) {
      const deleted = await svc.deleteWithCascade(child.id);
      for (const issue of deleted) {
        if (issue.executionRunId) {
          await cancelRun(db, issue.executionRunId, runningProcesses ?? new Map()).catch(() => undefined);
        }
      }
      deletedCount += deleted.length;
    }

    return reply.code(200).send({ rejected: true, reason, deletedSubIssues: deletedCount });
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

  // ── Work Products ──

  app.get('/issues/:issueId/work-products', { schema: { params: idParams }, preHandler: [requireActor] }, async (request) => {
    const { issueId } = idParams.parse(request.params);
    const issue = await svc.getById(issueId);
    return wpSvc.listForIssue(issue.id);
  });

  app.post('/issues/:issueId/work-products', { preHandler: [requireActor] }, async (request, reply) => {
    const { issueId } = idParams.parse(request.params);
    const body = createWorkProductBody.parse(request.body);
    const issue = await svc.getById(issueId);
    const product = await wpSvc.createForIssue(issue.id, issue.companyId, {
      ...body,
      projectId: body.projectId ?? issue.projectId ?? null,
    });
    if (!product) return reply.code(422).send({ error: { code: 'UNPROCESSABLE', message: 'Failed to create work product' } });
    return reply.code(201).send(product);
  });

  app.patch('/work-products/:workProductId', { preHandler: [requireActor] }, async (request, reply) => {
    const { workProductId } = workProductIdParams.parse(request.params);
    const body = updateWorkProductBody.parse(request.body);
    const product = await wpSvc.update(workProductId, body);
    if (!product) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Work product not found' } });
    return product;
  });

  app.delete('/work-products/:workProductId', { preHandler: [requireActor] }, async (request, reply) => {
    const { workProductId } = workProductIdParams.parse(request.params);
    const removed = await wpSvc.remove(workProductId);
    if (!removed) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Work product not found' } });
    return removed;
  });
};
