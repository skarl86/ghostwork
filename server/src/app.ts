/**
 * Fastify application factory
 */

import Fastify from 'fastify';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
    bodyLimit: 10 * 1024 * 1024, // 10MB
  });

  // Health check route
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}
