/**
 * Agent token routes — /api/agents/:agentId/token
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '@ghostwork/db';
import { agentService } from '../services/agents.js';
import { generateAgentToken } from '../auth/jwt.js';
import { requireActor } from '../hooks/require-actor.js';

const idParams = z.object({ agentId: z.string().uuid() });

export const agentTokenRoutes: FastifyPluginAsync<{
  db: Db;
  agentJwtSecret: string;
}> = async (app, opts) => {
  const { db, agentJwtSecret } = opts;
  const svc = agentService(db);

  app.post('/agents/:agentId/token', { preHandler: [requireActor] }, async (request, reply) => {
    const { agentId } = idParams.parse(request.params);
    const agent = await svc.getById(agentId);

    const token = generateAgentToken(
      {
        agentId: agent.id,
        companyId: agent.companyId,
        adapterType: agent.adapterType,
      },
      agentJwtSecret,
    );

    return reply.code(201).send({ token });
  });
};
