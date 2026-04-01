/**
 * Plugin API routes — manage plugins, state, and data.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { WorkerManager } from '../plugins-system/worker-manager.js';
import type { PluginStateStore } from '../services/plugin-state.js';

export interface PluginRoutesOpts {
  workerManager: WorkerManager;
  stateStore: PluginStateStore;
}

export const pluginRoutes: FastifyPluginAsync<PluginRoutesOpts> = async (app, opts) => {
  const { workerManager, stateStore } = opts;

  // List registered plugins
  app.get('/plugins', async () => {
    return workerManager.listWorkers();
  });

  // Enable plugin
  app.post<{ Params: { id: string } }>('/plugins/:id/enable', async (request) => {
    const { id } = request.params;
    const status = workerManager.getStatus(id);
    if (!status) {
      return { error: `Plugin ${id} not found` };
    }
    // Worker manager doesn't have a resume — it would re-spawn
    return { id, status: workerManager.getStatus(id) };
  });

  // Disable plugin
  app.post<{ Params: { id: string } }>('/plugins/:id/disable', async (request) => {
    const { id } = request.params;
    await workerManager.stop(id);
    return { id, status: 'stopped' };
  });

  // Get plugin state
  app.get<{ Params: { id: string } }>('/plugins/:id/state', async (request) => {
    const { id } = request.params;
    const entries = await stateStore.list(id);
    return { pluginId: id, state: entries };
  });

  // Query plugin data
  app.post<{ Params: { id: string } }>('/plugins/:id/data', async (request) => {
    const { id } = request.params;
    const body = request.body as { query?: string };
    try {
      const result = await workerManager.send(id, 'data.query', { query: body.query });
      return { pluginId: id, data: result };
    } catch (err) {
      return {
        pluginId: id,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  });
};
