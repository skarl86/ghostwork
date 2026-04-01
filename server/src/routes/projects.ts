/**
 * Projects routes — /api/projects
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import type { Db } from '@ghostwork/db';
import { projectWorkspaces } from '@ghostwork/db';
import { projectService } from '../services/projects.js';
import { requireActor } from '../hooks/require-actor.js';

const createBody = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
});

const updateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullish(),
  status: z.string().optional(),
});

const idParams = z.object({ projectId: z.string().uuid() });

const workspaceBody = z.object({
  cwd: z.string().min(1).max(1000),
  repoUrl: z.string().max(1000).nullish(),
  branch: z.string().max(200).nullish(),
});

const workspaceUpdateBody = z.object({
  cwd: z.string().min(1).max(1000).optional(),
  repoUrl: z.string().max(1000).nullish(),
  branch: z.string().max(200).nullish(),
});

const listQuery = z.object({
  companyId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const projectRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;
  const svc = projectService(db);

  app.get('/projects', { schema: { querystring: listQuery }, preHandler: [requireActor] }, async (request) => {
    const query = listQuery.parse(request.query);
    return svc.list({ companyId: query.companyId, limit: query.limit, offset: query.offset });
  });

  app.get('/projects/:projectId', { schema: { params: idParams }, preHandler: [requireActor] }, async (request) => {
    const { projectId } = idParams.parse(request.params);
    return svc.getById(projectId);
  });

  app.post('/projects', { schema: { body: createBody }, preHandler: [requireActor] }, async (request, reply) => {
    const body = createBody.parse(request.body);
    const result = await svc.create(body);
    return reply.code(201).send(result);
  });

  app.patch('/projects/:projectId', { schema: { params: idParams, body: updateBody }, preHandler: [requireActor] }, async (request) => {
    const { projectId } = idParams.parse(request.params);
    const body = updateBody.parse(request.body);
    return svc.update(projectId, body);
  });

  app.delete('/projects/:projectId', { schema: { params: idParams }, preHandler: [requireActor] }, async (request) => {
    const { projectId } = idParams.parse(request.params);
    return svc.remove(projectId);
  });

  // ── Project Workspace routes ──

  app.get('/projects/:projectId/workspace', { schema: { params: idParams }, preHandler: [requireActor] }, async (request) => {
    const { projectId } = idParams.parse(request.params);
    const rows = await db.select().from(projectWorkspaces).where(eq(projectWorkspaces.projectId, projectId)).limit(1);
    return rows[0] ?? null;
  });

  app.post('/projects/:projectId/workspace', { schema: { params: idParams, body: workspaceBody }, preHandler: [requireActor] }, async (request, reply) => {
    const { projectId } = idParams.parse(request.params);
    const body = workspaceBody.parse(request.body);

    // Get companyId from the project
    const project = await svc.getById(projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    // Upsert: check if workspace already exists
    const existing = await db.select().from(projectWorkspaces).where(eq(projectWorkspaces.projectId, projectId)).limit(1);

    const existingRow = existing[0];
    if (existingRow) {
      const updated = await db
        .update(projectWorkspaces)
        .set({ cwd: body.cwd, repoUrl: body.repoUrl ?? existingRow.repoUrl, branch: body.branch ?? existingRow.branch })
        .where(eq(projectWorkspaces.projectId, projectId))
        .returning();
      return updated[0];
    }

    const created = await db
      .insert(projectWorkspaces)
      .values({
        projectId,
        companyId: project.companyId,
        cwd: body.cwd,
        repoUrl: body.repoUrl ?? null,
        branch: body.branch ?? null,
        createdAt: new Date(),
      })
      .returning();
    return reply.code(201).send(created[0]);
  });

  app.patch('/projects/:projectId/workspace', { schema: { params: idParams, body: workspaceUpdateBody }, preHandler: [requireActor] }, async (request, reply) => {
    const { projectId } = idParams.parse(request.params);
    const body = workspaceUpdateBody.parse(request.body);

    const existing = await db.select().from(projectWorkspaces).where(eq(projectWorkspaces.projectId, projectId)).limit(1);
    if (existing.length === 0) return reply.code(404).send({ error: 'No workspace set for this project' });

    const updateData: Record<string, unknown> = {};
    if (body.cwd !== undefined) updateData['cwd'] = body.cwd;
    if (body.repoUrl !== undefined) updateData['repoUrl'] = body.repoUrl;
    if (body.branch !== undefined) updateData['branch'] = body.branch;

    const updated = await db
      .update(projectWorkspaces)
      .set(updateData)
      .where(eq(projectWorkspaces.projectId, projectId))
      .returning();
    return updated[0];
  });

  // ── Validate workspace path ──

  const validateBody = z.object({
    cwd: z.string().min(1).max(1000),
  });

  app.post('/projects/workspace/validate', { schema: { body: validateBody }, preHandler: [requireActor] }, async (request) => {
    const { cwd } = validateBody.parse(request.body);

    try {
      const stats = await stat(cwd);
      if (!stats.isDirectory()) {
        return { valid: false, reason: 'Path exists but is not a directory' };
      }
      return { valid: true };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return { valid: false, reason: 'Directory does not exist' };
      }
      if (code === 'EACCES') {
        return { valid: false, reason: 'Permission denied' };
      }
      return { valid: false, reason: 'Unable to access path' };
    }
  });

  // ── Validate repository URL ──

  const validateRepoBody = z.object({
    repoUrl: z.string().min(1).max(1000),
  });

  app.post('/projects/workspace/validate-repo', { schema: { body: validateRepoBody }, preHandler: [requireActor] }, async (request) => {
    const { repoUrl } = validateRepoBody.parse(request.body);

    // Basic URL format check
    if (!/^https?:\/\/.+/.test(repoUrl) && !repoUrl.includes('@')) {
      return { valid: false, reason: 'Invalid repository URL format' };
    }

    return new Promise<{ valid: boolean; reason?: string }>((resolve) => {
      execFile('git', ['ls-remote', '--exit-code', '--heads', repoUrl], { timeout: 10_000 }, (err) => {
        if (err) {
          const exitCode = (err as NodeJS.ErrnoException & { code?: number | string }).code;
          if (exitCode === 'ETIMEDOUT' || err.killed) {
            resolve({ valid: false, reason: 'Connection timed out' });
          } else {
            resolve({ valid: false, reason: 'Repository not found or not accessible' });
          }
        } else {
          resolve({ valid: true });
        }
      });
    });
  });
};
