/**
 * Unit tests for the live event bus.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createLiveEventBus,
  publishLogChunked,
  type LiveEvent,
} from '../../realtime/live-events.js';

describe('LiveEventBus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should deliver events to subscribers of the same companyId', () => {
    const bus = createLiveEventBus();
    const received: LiveEvent[] = [];

    bus.subscribe('company-1', (event) => received.push(event));

    bus.publish({
      companyId: 'company-1',
      type: 'heartbeat.run.status',
      payload: { runId: 'run-1', status: 'running' },
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.type).toBe('heartbeat.run.status');
    expect(received[0]!.companyId).toBe('company-1');
    expect(received[0]!.payload).toEqual({ runId: 'run-1', status: 'running' });
    expect(received[0]!.timestamp).toBeDefined();

    bus.removeAll();
  });

  it('should NOT deliver events to subscribers of a different companyId', () => {
    const bus = createLiveEventBus();
    const received: LiveEvent[] = [];

    bus.subscribe('company-2', (event) => received.push(event));

    bus.publish({
      companyId: 'company-1',
      type: 'heartbeat.run.status',
      payload: {},
    });

    expect(received).toHaveLength(0);

    bus.removeAll();
  });

  it('should support multiple subscribers for the same company', () => {
    const bus = createLiveEventBus();
    const received1: LiveEvent[] = [];
    const received2: LiveEvent[] = [];

    bus.subscribe('company-1', (event) => received1.push(event));
    bus.subscribe('company-1', (event) => received2.push(event));

    bus.publish({
      companyId: 'company-1',
      type: 'activity.logged',
      payload: { action: 'test' },
    });

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);

    bus.removeAll();
  });

  it('should unsubscribe correctly', () => {
    const bus = createLiveEventBus();
    const received: LiveEvent[] = [];

    const unsub = bus.subscribe('company-1', (event) => received.push(event));

    bus.publish({ companyId: 'company-1', type: 'agent.status', payload: {} });
    expect(received).toHaveLength(1);

    unsub();

    bus.publish({ companyId: 'company-1', type: 'agent.status', payload: {} });
    expect(received).toHaveLength(1); // still 1, not 2

    bus.removeAll();
  });

  it('should report listener count', () => {
    const bus = createLiveEventBus();

    expect(bus.listenerCount('company-1')).toBe(0);

    const unsub1 = bus.subscribe('company-1', () => {});
    expect(bus.listenerCount('company-1')).toBe(1);

    const unsub2 = bus.subscribe('company-1', () => {});
    expect(bus.listenerCount('company-1')).toBe(2);

    unsub1();
    expect(bus.listenerCount('company-1')).toBe(1);

    unsub2();
    expect(bus.listenerCount('company-1')).toBe(0);

    bus.removeAll();
  });

  it('should removeAll listeners', () => {
    const bus = createLiveEventBus();
    const received: LiveEvent[] = [];

    bus.subscribe('c1', (e) => received.push(e));
    bus.subscribe('c2', (e) => received.push(e));

    bus.removeAll();

    bus.publish({ companyId: 'c1', type: 'agent.status', payload: {} });
    bus.publish({ companyId: 'c2', type: 'agent.status', payload: {} });

    expect(received).toHaveLength(0);
  });
});

describe('publishLogChunked', () => {
  it('should send a single event for small data', () => {
    const bus = createLiveEventBus();
    const received: LiveEvent[] = [];
    bus.subscribe('company-1', (e) => received.push(e));

    publishLogChunked(bus, 'company-1', 'run-1', 'stdout', 'hello world');

    expect(received).toHaveLength(1);
    expect(received[0]!.type).toBe('heartbeat.run.log');
    const payload = received[0]!.payload as {
      runId: string;
      stream: string;
      chunk: string;
      seq: number;
      final: boolean;
    };
    expect(payload.runId).toBe('run-1');
    expect(payload.stream).toBe('stdout');
    expect(payload.chunk).toBe('hello world');
    expect(payload.seq).toBe(0);
    expect(payload.final).toBe(true);

    bus.removeAll();
  });

  it('should split large data into 8KB chunks', () => {
    const bus = createLiveEventBus();
    const received: LiveEvent[] = [];
    bus.subscribe('company-1', (e) => received.push(e));

    // Create a string > 8KB (10KB)
    const largeData = 'x'.repeat(10 * 1024);
    publishLogChunked(bus, 'company-1', 'run-1', 'stdout', largeData);

    // Should be 2 chunks: 8KB + 2KB
    expect(received).toHaveLength(2);

    const chunk0 = received[0]!.payload as { seq: number; final: boolean; chunk: string };
    const chunk1 = received[1]!.payload as { seq: number; final: boolean; chunk: string };

    expect(chunk0.seq).toBe(0);
    expect(chunk0.final).toBe(false);
    expect(chunk0.chunk.length).toBe(8 * 1024);

    expect(chunk1.seq).toBe(1);
    expect(chunk1.final).toBe(true);
    expect(chunk1.chunk.length).toBe(2 * 1024);

    bus.removeAll();
  });
});
