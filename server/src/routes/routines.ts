/**
 * Routines routes — /api/routines
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { routines, routineTriggers, routineRuns } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { requireActor } from '../hooks/require-actor.js';

const listQuery = z.object({
  companyId: z.string().uuid(),
});

const createBody = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1).max(500),
  description: z.string().max(10000).nullish(),
  triggerCron: z.string().nullish(),
  agentId: z.string().uuid().nullish(),
  enabled: z.boolean().optional().default(true),
});

export const routineRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;

  app.get('/routines', { preHandler: [requireActor] }, async (request) => {
    const query = listQuery.parse(request.query);
    const rows = await db
      .select()
      .from(routines)
      .where(eq(routines.companyId, query.companyId))
      .orderBy(desc(routines.createdAt));

    // Map DB schema to UI-expected shape
    return rows.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      name: r.name,
      description: r.description,
      triggerCron: null as string | null,
      agentId: null as string | null,
      enabled: r.status === 'active',
      lastRunAt: null as string | null,
      createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
    }));
  });

  app.post('/routines', { preHandler: [requireActor] }, async (request, reply) => {
    const body = createBody.parse(request.body);
    const now = new Date();

    const [row] = await db
      .insert(routines)
      .values({
        companyId: body.companyId,
        name: body.name,
        description: body.description ?? null,
        status: body.enabled ? 'active' : 'inactive',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // If cron trigger provided, insert into routineTriggers
    if (body.triggerCron && row) {
      await db.insert(routineTriggers).values({
        routineId: row.id,
        triggerType: 'cron',
        config: { cron: body.triggerCron },
        createdAt: now,
      });
    }

    return reply.code(201).send({
      id: row!.id,
      companyId: row!.companyId,
      name: row!.name,
      description: row!.description,
      triggerCron: body.triggerCron ?? null,
      agentId: body.agentId ?? null,
      enabled: body.enabled,
      lastRunAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });
};
