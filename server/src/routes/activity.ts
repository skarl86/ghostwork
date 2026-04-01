/**
 * Activity routes — /api/activity
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '@ghostwork/db';
import { activityService } from '../services/activity.js';
import { requireActor } from '../hooks/require-actor.js';

const listQuery = z.object({
  companyId: z.string().uuid(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const activityRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;
  const svc = activityService(db);

  app.get(
    '/activity',
    { schema: { querystring: listQuery }, preHandler: [requireActor] },
    async (request) => {
      const query = listQuery.parse(request.query);
      return svc.list({
        companyId: query.companyId,
        entityType: query.entityType,
        entityId: query.entityId,
        limit: query.limit,
        offset: query.offset,
      });
    },
  );
};
