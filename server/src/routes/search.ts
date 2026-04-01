/**
 * Search routes — /api/search
 *
 * Simple text search across agents, issues, projects, goals.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, ilike, or, and } from 'drizzle-orm';
import { agents, issues, projects, goals } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { requireActor } from '../hooks/require-actor.js';

const searchQuery = z.object({
  companyId: z.string().uuid(),
  q: z.string().min(1).max(200),
});

export const searchRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;

  app.get('/search', { preHandler: [requireActor] }, async (request) => {
    const { companyId, q } = searchQuery.parse(request.query);
    const pattern = `%${q}%`;

    const [agentRows, issueRows, projectRows, goalRows] = await Promise.all([
      db
        .select({ id: agents.id, name: agents.name, role: agents.role })
        .from(agents)
        .where(and(eq(agents.companyId, companyId), or(ilike(agents.name, pattern), ilike(agents.role, pattern))))
        .limit(5),
      db
        .select({ id: issues.id, title: issues.title, status: issues.status })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), ilike(issues.title, pattern)))
        .limit(5),
      db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(and(eq(projects.companyId, companyId), ilike(projects.name, pattern)))
        .limit(5),
      db
        .select({ id: goals.id, title: goals.title })
        .from(goals)
        .where(and(eq(goals.companyId, companyId), ilike(goals.title, pattern)))
        .limit(5),
    ]);

    const results = [
      ...agentRows.map((a) => ({ type: 'agent' as const, id: a.id, title: a.name, subtitle: a.role ?? undefined })),
      ...issueRows.map((i) => ({ type: 'issue' as const, id: i.id, title: i.title, subtitle: i.status ?? undefined })),
      ...projectRows.map((p) => ({ type: 'project' as const, id: p.id, title: p.name })),
      ...goalRows.map((g) => ({ type: 'goal' as const, id: g.id, title: g.title })),
    ];

    return results;
  });
};
