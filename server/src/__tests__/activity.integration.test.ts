/**
 * Integration tests for Activity Log service and route.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getTestDb } from './setup.js';
import { buildTestApp } from './helpers.js';
import { activityService } from '../services/activity.js';
import { companyService } from '../services/companies.js';

describe('Activity Log', () => {
  let companyId: string;

  beforeAll(async () => {
    const db = getTestDb();
    const company = await companyService(db).create({ name: 'Activity Test Co' });
    companyId = company.id;
  });

  describe('activityService', () => {
    it('should log an activity entry', async () => {
      const db = getTestDb();
      const svc = activityService(db);
      const entry = await svc.log({
        companyId,
        actorType: 'board',
        actorId: 'user-1',
        action: 'issue.created',
        entityType: 'issue',
        entityId: 'issue-1',
        metadata: { title: 'Test issue' },
      });

      expect(entry.id).toBeDefined();
      expect(entry.companyId).toBe(companyId);
      expect(entry.action).toBe('issue.created');
      expect(entry.entityType).toBe('issue');
      expect(entry.createdAt).toBeDefined();
    });

    it('should list activities for a company', async () => {
      const db = getTestDb();
      const svc = activityService(db);

      // Log a few entries
      await svc.log({ companyId, action: 'agent.created', entityType: 'agent', entityId: 'a1' });
      await svc.log({ companyId, action: 'agent.updated', entityType: 'agent', entityId: 'a1' });

      const entries = await svc.list({ companyId });
      expect(entries.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by entityType', async () => {
      const db = getTestDb();
      const svc = activityService(db);

      await svc.log({ companyId, action: 'project.created', entityType: 'project', entityId: 'p1' });

      const entries = await svc.list({ companyId, entityType: 'project' });
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries.every((e) => e.entityType === 'project')).toBe(true);
    });
  });

  describe('GET /api/activity', () => {
    it('should return activity entries for a company', async () => {
      const db = getTestDb();
      const app = await buildTestApp(db);

      const res = await app.inject({
        method: 'GET',
        url: `/api/activity?companyId=${companyId}`,
        remoteAddress: '127.0.0.1',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it('should require authentication', async () => {
      const db = getTestDb();
      const app = await buildTestApp(db, { mode: 'authenticated' });

      const res = await app.inject({
        method: 'GET',
        url: `/api/activity?companyId=${companyId}`,
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
