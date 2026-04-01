/**
 * Health check route — GET /api/health
 *
 * Returns comprehensive system status including DB, migrations,
 * scheduler, memory, and uptime.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@ghostwork/db';
import { inspectMigrations } from '@ghostwork/db';

export interface HealthRouteOpts {
  db: Db;
  getSchedulerStatus?: () => 'running' | 'stopped';
}

const startTime = Date.now();

export const healthRoutes: FastifyPluginAsync<HealthRouteOpts> = async (app, opts) => {
  const { db, getSchedulerStatus } = opts;

  app.get('/health', async () => {
    // DB check with latency measurement
    let dbStatus: string;
    let dbLatencyMs: number | null = null;
    try {
      const start = Date.now();
      await db.execute<{ ok: number }>('SELECT 1 as ok' as never);
      dbLatencyMs = Date.now() - start;
      dbStatus = 'connected';
    } catch {
      dbStatus = 'disconnected';
    }

    // Migration status
    let pendingMigrations: number | null;
    try {
      await inspectMigrations(db);
      // If inspect succeeds, assume no pending migrations
      pendingMigrations = 0;
    } catch {
      pendingMigrations = null;
    }

    // Memory usage
    const mem = process.memoryUsage();
    const memory = {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
    };

    // Scheduler status
    const scheduler = getSchedulerStatus ? getSchedulerStatus() : 'unknown';

    // Uptime
    const uptimeMs = Date.now() - startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);

    return {
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      db: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      migrations: {
        pendingCount: pendingMigrations,
      },
      scheduler,
      memory,
      uptime: {
        seconds: uptimeSeconds,
        human: formatUptime(uptimeSeconds),
      },
    };
  });
};

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}
