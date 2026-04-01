/**
 * Costs routes — /api/costs
 *
 * Aggregates cost data from heartbeat runs per agent.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { heartbeatRuns, agents } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { requireActor } from '../hooks/require-actor.js';

const listQuery = z.object({
  companyId: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const costRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;

  app.get('/costs', { preHandler: [requireActor] }, async (request) => {
    const query = listQuery.parse(request.query);
    const conditions = [eq(heartbeatRuns.companyId, query.companyId)];

    if (query.from) {
      conditions.push(gte(heartbeatRuns.createdAt, new Date(query.from)));
    }
    if (query.to) {
      conditions.push(lte(heartbeatRuns.createdAt, new Date(query.to)));
    }

    const rows = await db
      .select({
        agentId: heartbeatRuns.agentId,
        agentName: agents.name,
        adapterType: agents.adapterType,
        totalCostUsd: sql<number>`coalesce(sum(cast(${heartbeatRuns.costUsd} as real)), 0)`,
        runCount: sql<number>`count(*)`,
      })
      .from(heartbeatRuns)
      .leftJoin(agents, eq(heartbeatRuns.agentId, agents.id))
      .where(and(...conditions))
      .groupBy(heartbeatRuns.agentId, agents.name, agents.adapterType);

    return rows.map((r) => ({
      agentId: r.agentId,
      agentName: r.agentName ?? 'Unknown',
      adapterType: r.adapterType ?? 'unknown',
      totalCostUsd: Number(r.totalCostUsd) || 0,
      runCount: Number(r.runCount) || 0,
    }));
  });
};
