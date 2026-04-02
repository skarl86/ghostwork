/**
 * @ghostwork/server — Bootstrap sequence
 *
 * 1. loadConfig()
 * 2. DB init (embedded PG if no DATABASE_URL)
 * 3. Run migrations
 * 4. buildApp(db, config)
 * 5. app.listen()
 * 6. Graceful shutdown
 */

import { eq } from 'drizzle-orm';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { createDb, getConnectionUrl, applyPendingMigrations, issues } from '@ghostwork/db';
import { createScheduler } from './heartbeat/scheduler.js';
import { createLiveEventBus } from './realtime/live-events.js';
import {
  createAdapterRegistry,
  claudeLocalAdapter,
  codexLocalAdapter,
  geminiLocalAdapter,
  openclawGatewayAdapter,
  httpAdapter,
  processAdapter,
} from '@ghostwork/adapters';

async function main(): Promise<void> {
  // 1. Config
  const config = loadConfig();

  // 2. DB init
  const { url: dbUrl, stop: stopEmbeddedPg } = await getConnectionUrl();
  const { db, client } = createDb(dbUrl);

  // 3. Migrations
  if (config.migrationAutoApply) {
    await applyPendingMigrations(db);
  }

  // 3.5 Fix legacy 'open' status → 'todo'
  const fixedRows = await db
    .update(issues)
    .set({ status: 'todo', updatedAt: new Date() })
    .where(eq(issues.status, 'open'))
    .returning({ id: issues.id });
  if (fixedRows.length > 0) {
    console.log(`[Startup] Fixed ${fixedRows.length} issues with 'open' status → 'todo'`);
  }

  // 4. Build adapter registry
  const adapterRegistry = createAdapterRegistry([
    claudeLocalAdapter,
    codexLocalAdapter,
    geminiLocalAdapter,
    openclawGatewayAdapter,
    httpAdapter,
    processAdapter,
  ]);

  // 5. Create shared eventBus so both app and scheduler use the same instance
  const eventBus = createLiveEventBus();

  // 6. Create heartbeat scheduler before app so routes can access runningProcesses
  let schedulerRunning = false;
  const scheduler = createScheduler(db, {
    intervalMs: 10_000, // tick every 10 seconds
    apiUrl: `http://localhost:${config.port}`,
  }, eventBus, adapterRegistry);

  // 7. Build app (pass runningProcesses so issue cancellation can signal processes)
  const app = await buildApp(db, config, eventBus, () => schedulerRunning ? 'running' : 'stopped', adapterRegistry, scheduler.runningProcesses);

  // 8. Listen
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Server listening on ${config.host}:${config.port} (mode: ${config.mode})`);
  app.log.info(`Registered adapters: ${adapterRegistry.list().map(a => a.type).join(', ')}`);

  // 9. Start scheduler
  scheduler.start();
  schedulerRunning = true;
  app.log.info('Heartbeat scheduler started (10s interval)');

  // 10. Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    scheduler.stop();
    schedulerRunning = false;
    await app.close();
    await client.end();
    await stopEmbeddedPg();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
