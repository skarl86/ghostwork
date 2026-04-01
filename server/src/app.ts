/**
 * Fastify application factory — builds and configures the full app.
 */

import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { Db } from '@ghostwork/db';
import type { AdapterRegistry } from '@ghostwork/adapters';
import type { AppConfig } from './config.js';
import { errorHandler } from './errors.js';
import actorPlugin from './plugins/actor.js';
import guardPlugin from './plugins/guard.js';
import { healthRoutes } from './routes/health.js';
import { companyRoutes } from './routes/companies.js';
import { agentRoutes } from './routes/agents.js';
import { projectRoutes } from './routes/projects.js';
import { issueRoutes } from './routes/issues.js';
import { goalRoutes } from './routes/goals.js';
import { heartbeatRoutes } from './routes/heartbeat.js';
import { activityRoutes } from './routes/activity.js';
import { budgetRoutes } from './routes/budgets.js';
import { approvalRoutes } from './routes/approvals.js';
import { secretRoutes } from './routes/secrets.js';
import { agentTokenRoutes } from './routes/agent-tokens.js';
import { portabilityRoutes } from './routes/portability.js';
import { costRoutes } from './routes/costs.js';
import { routineRoutes } from './routes/routines.js';
import { searchRoutes } from './routes/search.js';
import { authRoutes } from './auth/better-auth.js';
import { wsRoutes } from './realtime/ws-handler.js';
import { adapterRoutes } from './routes/adapters.js';
import { createLiveEventBus, type LiveEventBus } from './realtime/live-events.js';
import { randomBytes } from 'node:crypto';

export async function buildApp(
  db: Db,
  config: AppConfig,
  eventBus?: LiveEventBus,
  getSchedulerStatus?: () => 'running' | 'stopped',
  adapterRegistry?: AdapterRegistry,
) {
  const bus = eventBus ?? createLiveEventBus();

  const app = Fastify({
    logger: {
      level: config.logLevel,
      ...(config.isDev && {
        transport: { target: 'pino-pretty' },
      }),
    },
    bodyLimit: 10 * 1024 * 1024, // 10MB
  });

  // Zod type provider
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Error handler
  app.setErrorHandler(errorHandler);

  // WebSocket plugin
  await app.register(fastifyWebsocket);

  // Plugins (order matters)
  await app.register(actorPlugin, { config, db });
  await app.register(guardPlugin, { config });

  // Routes under /api prefix
  await app.register(
    async (api) => {
      await api.register(healthRoutes, { db, getSchedulerStatus });
      await api.register(companyRoutes, { db });
      await api.register(agentRoutes, { db });
      await api.register(projectRoutes, { db });
      await api.register(issueRoutes, { db });
      await api.register(goalRoutes, { db });
      await api.register(heartbeatRoutes, { db });
      await api.register(activityRoutes, { db });
      await api.register(budgetRoutes, { db });
      await api.register(approvalRoutes, { db });
      await api.register(costRoutes, { db });
      await api.register(routineRoutes, { db });
      await api.register(searchRoutes, { db });

      // Secrets require an encryption key (32 bytes hex)
      const encryptionKey =
        process.env['GHOSTWORK_SECRETS_KEY'] || randomBytes(32).toString('hex');
      await api.register(secretRoutes, { db, encryptionKey });

      // Agent token generation requires JWT secret
      const agentJwtSecret = config.agentJwtSecret || 'dev-jwt-secret';
      await api.register(agentTokenRoutes, { db, agentJwtSecret });

      // Portability (export/import)
      await api.register(portabilityRoutes, { db });

      // Auth routes (BetterAuth)
      const authSecret = process.env['GHOSTWORK_AUTH_SECRET'] || 'dev-auth-secret';
      await api.register(authRoutes, { authConfig: { secret: authSecret }, db });

      await api.register(wsRoutes, { db, eventBus: bus });

      // Adapter routes (models listing)
      if (adapterRegistry) {
        await api.register(adapterRoutes, { adapterRegistry });
      }
    },
    { prefix: '/api' },
  );

  // Decorate app with eventBus for external access
  app.decorate('eventBus', bus);

  return app;
}

// Fastify augmentation
declare module 'fastify' {
  interface FastifyInstance {
    eventBus: LiveEventBus;
  }
}
