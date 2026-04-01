/**
 * Adapters routes — /api/adapters
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AdapterRegistry } from '@ghostwork/adapters';

const adapterTypeParams = z.object({ adapterType: z.string().min(1) });

interface AdaptersRouteOptions {
  adapterRegistry: AdapterRegistry;
}

export const adapterRoutes: FastifyPluginAsync<AdaptersRouteOptions> = async (
  app,
  { adapterRegistry },
) => {
  /** GET /api/adapters/:adapterType/models */
  app.get(
    '/adapters/:adapterType/models',
    async (request, reply) => {
      const { adapterType } = adapterTypeParams.parse(request.params);
      const adapter = adapterRegistry.get(adapterType);

      if (!adapter) {
        return reply.status(404).send({ error: `Adapter "${adapterType}" not found` });
      }

      // Prefer dynamic listModels() if available, fallback to static models array
      const models = adapter.listModels
        ? await adapter.listModels()
        : adapter.models ?? [];

      return { models };
    },
  );
};
