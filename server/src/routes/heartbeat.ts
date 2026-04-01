/**
 * Heartbeat routes — /api/heartbeat
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { heartbeatRuns, heartbeatRunEvents } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { enqueueWakeup } from '../heartbeat/queue.js';
import { requireActor } from '../hooks/require-actor.js';

const listRunsBody = z.object({
  companyId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  status: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

const wakeupBody = z.object({
  companyId: z.string().uuid(),
  agentId: z.string().uuid(),
  taskScope: z.string().nullish(),
  taskId: z.string().nullish(),
  contextSnapshot: z.record(z.string(), z.unknown()).nullish(),
  reason: z.string().nullish(),
});

const runIdParams = z.object({ runId: z.string().uuid() });

export const heartbeatRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;

  // List runs
  app.post(
    '/heartbeat/runs',
    { preHandler: [requireActor] },
    async (request) => {
      const body = listRunsBody.parse(request.body);
      const conditions = [];

      if (body.companyId) conditions.push(eq(heartbeatRuns.companyId, body.companyId));
      if (body.agentId) conditions.push(eq(heartbeatRuns.agentId, body.agentId));
      if (body.status) conditions.push(eq(heartbeatRuns.status, body.status));

      const query = db
        .select()
        .from(heartbeatRuns)
        .orderBy(desc(heartbeatRuns.createdAt))
        .limit(body.limit)
        .offset(body.offset);

      if (conditions.length > 0) {
        return query.where(and(...conditions));
      }
      return query;
    },
  );

  // Manual wakeup
  app.post(
    '/heartbeat/wakeup',
    { preHandler: [requireActor] },
    async (request, reply) => {
      const body = wakeupBody.parse(request.body);
      const result = await enqueueWakeup(db, {
        companyId: body.companyId,
        agentId: body.agentId,
        taskScope: body.taskScope ?? undefined,
        taskId: body.taskId ?? undefined,
        contextSnapshot: body.contextSnapshot ?? undefined,
        reason: body.reason ?? 'manual',
      });

      // Publish queued event
      app.eventBus.publish({
        companyId: body.companyId,
        type: 'heartbeat.run.queued',
        payload: {
          runId: result.runId,
          agentId: body.agentId,
          coalesced: result.coalesced,
          deferred: result.deferred,
          reason: body.reason ?? 'manual',
        },
      });

      return reply.code(201).send(result);
    },
  );

  // Get run details
  app.get(
    '/heartbeat/runs/:runId',
    { preHandler: [requireActor] },
    async (request) => {
      const { runId } = runIdParams.parse(request.params);
      const rows = await db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, runId));
      if (rows.length === 0) {
        return request.server.log.error(`Run ${runId} not found`);
      }
      return rows[0];
    },
  );

  // Get run events
  app.get(
    '/heartbeat/runs/:runId/events',
    { preHandler: [requireActor] },
    async (request) => {
      const { runId } = runIdParams.parse(request.params);
      return db
        .select()
        .from(heartbeatRunEvents)
        .where(eq(heartbeatRunEvents.runId, runId))
        .orderBy(heartbeatRunEvents.createdAt);
    },
  );
};
