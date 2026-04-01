/**
 * Hello Plugin — Example plugin that counts completed heartbeat runs.
 *
 * Subscribes to `heartbeat.run.status` events,
 * counts completed runs in state,
 * provides run count data.
 */

import { definePlugin } from '../../server/src/plugins-system/sdk.js';

export default definePlugin({
  id: 'hello-plugin',
  name: 'Hello Plugin',
  version: '1.0.0',
  description: 'Counts completed heartbeat runs',

  async setup(ctx) {
    ctx.logger.info('Hello Plugin starting up!');

    // Subscribe to heartbeat run status events
    ctx.events.on('heartbeat.run.status', async (payload) => {
      const data = payload as { status?: string; runId?: string };
      if (data.status === 'completed') {
        const current = ((await ctx.state.get('completedRunCount')) as number) ?? 0;
        await ctx.state.set('completedRunCount', current + 1);
        ctx.logger.info(`Run ${data.runId} completed. Total: ${current + 1}`);
      }
    });

    // Provide data endpoint
    ctx.data.provide('runCount', async () => {
      const count = ((await ctx.state.get('completedRunCount')) as number) ?? 0;
      return { completedRuns: count };
    });

    ctx.logger.info('Hello Plugin ready');
  },
});
