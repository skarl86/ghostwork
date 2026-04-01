/**
 * Plugin Event Bridge tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { createLiveEventBus } from '../../realtime/live-events.js';
import { createPluginEventBridge } from '../../plugins-system/event-bridge.js';
import type { WorkerManager } from '../../plugins-system/worker-manager.js';

function createMockWorkerManager(): WorkerManager {
  return {
    spawn: vi.fn(),
    stop: vi.fn(),
    stopAll: vi.fn(),
    send: vi.fn(),
    notify: vi.fn(),
    getStatus: vi.fn().mockReturnValue('running'),
    listWorkers: vi.fn().mockReturnValue([]),
  };
}

describe('PluginEventBridge', () => {
  it('should forward matching events to subscribed plugins', () => {
    const eventBus = createLiveEventBus();
    const workerManager = createMockWorkerManager();
    const bridge = createPluginEventBridge(eventBus, workerManager);

    bridge.subscribe('plugin-1', ['heartbeat.run.status']);
    bridge.watch('company-1');

    // Publish a matching event
    eventBus.publish({
      companyId: 'company-1',
      type: 'heartbeat.run.status',
      payload: { runId: 'run-1', status: 'completed' },
    });

    expect(workerManager.notify).toHaveBeenCalledWith(
      'plugin-1',
      'event',
      expect.objectContaining({
        type: 'heartbeat.run.status',
        companyId: 'company-1',
      }),
    );
  });

  it('should not forward non-matching events', () => {
    const eventBus = createLiveEventBus();
    const workerManager = createMockWorkerManager();
    const bridge = createPluginEventBridge(eventBus, workerManager);

    bridge.subscribe('plugin-1', ['heartbeat.run.status']);
    bridge.watch('company-1');

    // Publish a non-matching event
    eventBus.publish({
      companyId: 'company-1',
      type: 'agent.status',
      payload: { agentId: 'a1' },
    });

    expect(workerManager.notify).not.toHaveBeenCalled();
  });

  it('should forward to multiple plugins', () => {
    const eventBus = createLiveEventBus();
    const workerManager = createMockWorkerManager();
    const bridge = createPluginEventBridge(eventBus, workerManager);

    bridge.subscribe('plugin-1', ['heartbeat.run.status']);
    bridge.subscribe('plugin-2', ['heartbeat.run.status']);
    bridge.watch('company-1');

    eventBus.publish({
      companyId: 'company-1',
      type: 'heartbeat.run.status',
      payload: { status: 'done' },
    });

    expect(workerManager.notify).toHaveBeenCalledTimes(2);
  });

  it('should unsubscribe a plugin', () => {
    const eventBus = createLiveEventBus();
    const workerManager = createMockWorkerManager();
    const bridge = createPluginEventBridge(eventBus, workerManager);

    bridge.subscribe('plugin-1', ['heartbeat.run.status']);
    bridge.watch('company-1');
    bridge.unsubscribe('plugin-1');

    eventBus.publish({
      companyId: 'company-1',
      type: 'heartbeat.run.status',
      payload: {},
    });

    expect(workerManager.notify).not.toHaveBeenCalled();
  });

  it('should stop all watches', () => {
    const eventBus = createLiveEventBus();
    const workerManager = createMockWorkerManager();
    const bridge = createPluginEventBridge(eventBus, workerManager);

    bridge.subscribe('plugin-1', ['heartbeat.run.status']);
    bridge.watch('company-1');
    bridge.stopAll();

    eventBus.publish({
      companyId: 'company-1',
      type: 'heartbeat.run.status',
      payload: {},
    });

    expect(workerManager.notify).not.toHaveBeenCalled();
  });
});
