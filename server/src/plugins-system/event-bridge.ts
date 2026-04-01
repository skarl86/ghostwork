/**
 * Plugin Event Bridge — forwards LiveEventBus events to plugin workers.
 */

import type { LiveEventBus, LiveEventType } from '../realtime/live-events.js';
import type { WorkerManager } from './worker-manager.js';

export interface PluginEventBridge {
  /** Register a plugin to receive specific event types. */
  subscribe(pluginId: string, eventTypes: LiveEventType[]): void;
  /** Unsubscribe a plugin from all events. */
  unsubscribe(pluginId: string): void;
  /** Start listening on a company's events. */
  watch(companyId: string): void;
  /** Stop all watches. */
  stopAll(): void;
}

export function createPluginEventBridge(
  eventBus: LiveEventBus,
  workerManager: WorkerManager,
): PluginEventBridge {
  const subscriptions = new Map<string, Set<LiveEventType>>();
  const unsubscribers: Array<() => void> = [];

  return {
    subscribe(pluginId, eventTypes) {
      subscriptions.set(pluginId, new Set(eventTypes));
    },

    unsubscribe(pluginId) {
      subscriptions.delete(pluginId);
    },

    watch(companyId) {
      const unsub = eventBus.subscribe(companyId, (event) => {
        // Forward to all subscribed plugins
        for (const [pluginId, types] of subscriptions) {
          if (types.has(event.type)) {
            workerManager.notify(pluginId, 'event', {
              type: event.type,
              companyId: event.companyId,
              payload: event.payload,
              timestamp: event.timestamp,
            });
          }
        }
      });
      unsubscribers.push(unsub);
    },

    stopAll() {
      for (const unsub of unsubscribers) {
        unsub();
      }
      unsubscribers.length = 0;
      subscriptions.clear();
    },
  };
}
