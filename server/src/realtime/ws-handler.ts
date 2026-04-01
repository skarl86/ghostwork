/**
 * WebSocket handler — route for real-time event streaming.
 *
 * GET /companies/:companyId/events/ws (websocket: true)
 */

import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@ghostwork/db';
import type { LiveEventBus } from './live-events.js';

const PING_INTERVAL_MS = 30_000;

export const wsRoutes: FastifyPluginAsync<{
  db: Db;
  eventBus: LiveEventBus;
}> = async (app, opts) => {
  const { eventBus } = opts;

  app.get(
    '/companies/:companyId/events/ws',
    { websocket: true },
    (socket, request) => {
      // Auth check — actor must exist (handled by onRequest hook)
      if (!request.actor || request.actor.type === 'none') {
        socket.close(4001, 'Unauthorized');
        return;
      }

      const { companyId } = request.params as { companyId: string };

      // Subscribe to events for this company
      const unsubscribe = eventBus.subscribe(companyId, (event) => {
        if (socket.readyState === 1 /* OPEN */) {
          socket.send(JSON.stringify(event));
        }
      });

      // Ping/pong keepalive
      let alive = true;
      const pingTimer = setInterval(() => {
        if (!alive) {
          socket.terminate();
          return;
        }
        alive = false;
        socket.ping();
      }, PING_INTERVAL_MS);

      socket.on('pong', () => {
        alive = true;
      });

      // Clean disconnect
      socket.on('close', () => {
        clearInterval(pingTimer);
        unsubscribe();
      });

      socket.on('error', () => {
        clearInterval(pingTimer);
        unsubscribe();
      });
    },
  );
};
