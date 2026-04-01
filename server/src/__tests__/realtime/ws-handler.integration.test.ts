/**
 * Integration tests for WebSocket handler.
 */

import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { getTestDb } from '../setup.js';
import { defaultTestConfig } from '../helpers.js';
import { createLiveEventBus, type LiveEvent } from '../../realtime/live-events.js';

describe('WebSocket /api/companies/:companyId/events/ws', () => {
  let cleanup: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const fn of cleanup) {
      await fn();
    }
    cleanup = [];
  });

  async function startServer(configOverrides?: Partial<typeof defaultTestConfig>) {
    const db = getTestDb();
    const eventBus = createLiveEventBus();
    const config = { ...defaultTestConfig, ...configOverrides };
    const app = await import('../../app.js').then((m) => m.buildApp(db, config, eventBus));
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    cleanup.push(async () => {
      eventBus.removeAll();
      await app.close();
    });
    return { app, eventBus, address };
  }

  function connectWs(address: string, companyId: string): Promise<WebSocket> {
    const wsUrl = address.replace(/^http/, 'ws') + `/api/companies/${companyId}/events/ws`;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      cleanup.push(async () => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      });
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  }

  it('should receive live events for the subscribed company', async () => {
    const { eventBus, address } = await startServer();
    const ws = await connectWs(address, 'aaaaaaaa-0000-0000-0000-000000000001');

    const messages: LiveEvent[] = [];
    ws.on('message', (data: WebSocket.RawData) => {
      messages.push(JSON.parse(data.toString()));
    });

    // Publish an event after small delay to ensure subscription is active
    await new Promise((r) => setTimeout(r, 50));
    eventBus.publish({
      companyId: 'aaaaaaaa-0000-0000-0000-000000000001',
      type: 'heartbeat.run.status',
      payload: { runId: 'test-run', status: 'running' },
    });

    await new Promise((r) => setTimeout(r, 100));

    expect(messages).toHaveLength(1);
    expect(messages[0]!.type).toBe('heartbeat.run.status');
    expect(messages[0]!.companyId).toBe('aaaaaaaa-0000-0000-0000-000000000001');
  });

  it('should NOT receive events for a different company', async () => {
    const { eventBus, address } = await startServer();
    const ws = await connectWs(address, 'aaaaaaaa-0000-0000-0000-000000000001');

    const messages: LiveEvent[] = [];
    ws.on('message', (data: WebSocket.RawData) => {
      messages.push(JSON.parse(data.toString()));
    });

    await new Promise((r) => setTimeout(r, 50));
    eventBus.publish({
      companyId: 'bbbbbbbb-0000-0000-0000-000000000002',
      type: 'heartbeat.run.status',
      payload: { runId: 'other-run', status: 'running' },
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(messages).toHaveLength(0);
  });

  it('should reject unauthorized connections (authenticated mode)', async () => {
    const { address } = await startServer({ mode: 'authenticated' });

    const wsUrl =
      address.replace(/^http/, 'ws') +
      '/api/companies/aaaaaaaa-0000-0000-0000-000000000001/events/ws';

    const closePromise = new Promise<{ code: number }>((resolve) => {
      const ws = new WebSocket(wsUrl);
      cleanup.push(async () => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      });
      ws.on('close', (code) => resolve({ code }));
      ws.on('error', () => {}); // swallow connection errors
    });

    const { code } = await closePromise;
    expect(code).toBe(4001);
  });
});
