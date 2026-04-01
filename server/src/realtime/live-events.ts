/**
 * Live Event Bus — EventEmitter-based pub/sub for real-time events.
 *
 * Events are scoped by companyId so subscribers only receive
 * events relevant to their company.
 */

import { EventEmitter } from 'node:events';

// ── Event Types ──

export type LiveEventType =
  | 'heartbeat.run.status'
  | 'heartbeat.run.event'
  | 'heartbeat.run.log'
  | 'heartbeat.run.queued'
  | 'agent.status'
  | 'activity.logged'
  | 'issue.status';

export interface LiveEvent {
  type: LiveEventType;
  companyId: string;
  payload: unknown;
  timestamp: string;
}

export type LiveEventHandler = (event: LiveEvent) => void;

export interface LiveEventBus {
  /** Subscribe to all events for a given company. Returns unsubscribe fn. */
  subscribe(companyId: string, handler: LiveEventHandler): () => void;

  /** Publish an event to all subscribers of the given company. */
  publish(event: { companyId: string; type: LiveEventType; payload: unknown }): void;

  /** Number of listeners for a company (for diagnostics). */
  listenerCount(companyId: string): number;

  /** Remove all listeners (for cleanup). */
  removeAll(): void;
}

const LOG_CHUNK_SIZE = 8 * 1024; // 8KB

/**
 * Create an in-memory live event bus.
 */
export function createLiveEventBus(): LiveEventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0); // No limit on listeners

  return {
    subscribe(companyId, handler) {
      emitter.on(companyId, handler);
      return () => {
        emitter.off(companyId, handler);
      };
    },

    publish({ companyId, type, payload }) {
      const event: LiveEvent = {
        type,
        companyId,
        payload,
        timestamp: new Date().toISOString(),
      };
      emitter.emit(companyId, event);
    },

    listenerCount(companyId) {
      return emitter.listenerCount(companyId);
    },

    removeAll() {
      emitter.removeAllListeners();
    },
  };
}

/**
 * Publish a run log event, splitting large output into 8KB chunks.
 */
export function publishLogChunked(
  bus: LiveEventBus,
  companyId: string,
  runId: string,
  stream: string,
  data: string,
): void {
  if (data.length <= LOG_CHUNK_SIZE) {
    bus.publish({
      companyId,
      type: 'heartbeat.run.log',
      payload: { runId, stream, chunk: data, seq: 0, final: true },
    });
    return;
  }

  // Split into chunks
  let seq = 0;
  let offset = 0;
  while (offset < data.length) {
    const end = Math.min(offset + LOG_CHUNK_SIZE, data.length);
    const chunk = data.slice(offset, end);
    const isFinal = end >= data.length;

    bus.publish({
      companyId,
      type: 'heartbeat.run.log',
      payload: { runId, stream, chunk, seq, final: isFinal },
    });

    seq++;
    offset = end;
  }
}
