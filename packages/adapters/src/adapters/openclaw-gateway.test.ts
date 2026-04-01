import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openclawGatewayAdapter } from './openclaw-gateway.js';
import { createTestContext } from '../testing.js';

// ── Mock WebSocket ──

type WsHandler = (...args: unknown[]) => void;

class MockWebSocket {
  handlers: Record<string, WsHandler[]> = {};
  sentMessages: string[] = [];
  readyState = 1; // OPEN
  closed = false;

  on(event: string, handler: WsHandler): void {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event]!.push(handler);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.closed = true;
    this.emit('close');
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers[event] ?? []) {
      handler(...args);
    }
  }
}

function createMockWsFactory() {
  let lastWs: MockWebSocket | null = null;

  const factory = (_url: string) => {
    lastWs = new MockWebSocket();
    // Auto-open on next tick
    setTimeout(() => lastWs!.emit('open'), 0);
    return lastWs;
  };

  return {
    factory,
    getLastWs: () => lastWs!,
  };
}

describe('openclaw-gateway adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('type', () => {
    it('has correct type identifier', () => {
      expect(openclawGatewayAdapter.type).toBe('openclaw-gateway');
    });
  });

  describe('execute', () => {
    it('returns error when gateway URL not configured', async () => {
      const ctx = createTestContext({ config: {} });

      const result = await openclawGatewayAdapter.execute(ctx);

      expect(result.exitCode).toBe(1);
      expect(result.summary).toContain('Gateway URL not configured');
    });

    it('returns error when keys not configured', async () => {
      const ctx = createTestContext({
        config: { gatewayUrl: 'ws://localhost:3000' },
      });

      const result = await openclawGatewayAdapter.execute(ctx);

      expect(result.exitCode).toBe(1);
      expect(result.summary).toContain('keys not configured');
    });

    it('handles WebSocket error events', async () => {
      const { factory, getLastWs } = createMockWsFactory();

      const ctx = createTestContext({
        config: {
          gatewayUrl: 'ws://localhost:3000',
          publicKeyPem: 'test-pub-key',
          privateKeyPem: 'test-priv-key',
          _wsFactory: factory,
        },
      });

      const resultPromise = openclawGatewayAdapter.execute(ctx);

      // Wait for WebSocket to be created
      await new Promise((r) => setTimeout(r, 10));

      const ws = getLastWs();
      ws.emit('error', new Error('Connection refused'));

      const result = await resultPromise;

      expect(result.exitCode).toBe(1);
      expect(result.summary).toContain('WebSocket error');
      expect(result.summary).toContain('Connection refused');
    });

    it('handles gateway error messages', async () => {
      const { factory, getLastWs } = createMockWsFactory();

      const ctx = createTestContext({
        config: {
          gatewayUrl: 'ws://localhost:3000',
          publicKeyPem: 'test-pub-key',
          privateKeyPem: 'test-priv-key',
          _wsFactory: factory,
        },
      });

      const resultPromise = openclawGatewayAdapter.execute(ctx);

      await new Promise((r) => setTimeout(r, 10));

      const ws = getLastWs();
      ws.emit('message', JSON.stringify({ type: 'error', error: 'Unauthorized' }));

      const result = await resultPromise;

      expect(result.exitCode).toBe(1);
      expect(result.summary).toBe('Unauthorized');
    });

    it('handles successful task completion flow', async () => {
      const { factory, getLastWs } = createMockWsFactory();

      const ctx = createTestContext({
        config: {
          gatewayUrl: 'ws://localhost:3000',
          publicKeyPem: 'test-pub-key',
          privateKeyPem: 'test-priv-key',
          _wsFactory: factory,
        },
        context: { prompt: 'Do the task' },
      });

      const resultPromise = openclawGatewayAdapter.execute(ctx);

      await new Promise((r) => setTimeout(r, 10));

      const ws = getLastWs();

      // Simulate connected event
      ws.emit('message', JSON.stringify({ type: 'connected' }));

      // Should have sent a task message
      await new Promise((r) => setTimeout(r, 5));
      const taskMsg = ws.sentMessages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'task';
      });
      expect(taskMsg).toBeDefined();
      const parsed = JSON.parse(taskMsg!);
      expect(parsed.prompt).toBe('Do the task');

      // Simulate stream events
      ws.emit('message', JSON.stringify({ type: 'stream', stream: 'assistant', data: 'Task done!' }));

      // Simulate completion
      ws.emit('message', JSON.stringify({ type: 'task.completed', sessionId: 'sess-123' }));

      const result = await resultPromise;

      expect(result.exitCode).toBe(0);
      expect(result.summary).toBe('Task done!');
      expect(result.sessionId).toBe('sess-123');
      expect(result.provider).toBe('openclaw');
    });

    it('uses issue session key strategy by default', async () => {
      const { factory, getLastWs } = createMockWsFactory();

      const ctx = createTestContext({
        config: {
          gatewayUrl: 'ws://localhost:3000',
          publicKeyPem: 'test-pub-key',
          privateKeyPem: 'test-priv-key',
          _wsFactory: factory,
        },
        runtime: {
          sessionId: null,
          sessionParams: null,
          taskKey: 'issue-42',
        },
      });

      const resultPromise = openclawGatewayAdapter.execute(ctx);

      await new Promise((r) => setTimeout(r, 10));

      const ws = getLastWs();
      ws.emit('message', JSON.stringify({ type: 'connected' }));

      await new Promise((r) => setTimeout(r, 5));

      const taskMsg = ws.sentMessages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'task';
      });
      const parsed = JSON.parse(taskMsg!);
      expect(parsed.sessionKey).toBe('ghostwork:issue:issue-42');

      ws.emit('message', JSON.stringify({ type: 'task.completed' }));

      await resultPromise;
    });

    it('closes on close event gracefully', async () => {
      const { factory, getLastWs } = createMockWsFactory();

      const ctx = createTestContext({
        config: {
          gatewayUrl: 'ws://localhost:3000',
          publicKeyPem: 'test-pub-key',
          privateKeyPem: 'test-priv-key',
          _wsFactory: factory,
        },
      });

      const resultPromise = openclawGatewayAdapter.execute(ctx);

      await new Promise((r) => setTimeout(r, 10));

      const ws = getLastWs();
      ws.emit('close');

      const result = await resultPromise;

      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('testEnvironment', () => {
    it('returns error when gateway URL not configured', async () => {
      const ctx = createTestContext({ config: {} });

      const result = await openclawGatewayAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Gateway URL not configured');
    });

    it('returns ok when gateway is reachable', async () => {
      // Mock global fetch
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const ctx = createTestContext({
        config: { gatewayUrl: 'ws://localhost:3000' },
      });

      const result = await openclawGatewayAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(true);
      globalThis.fetch = originalFetch;
    });

    it('returns error when gateway is not reachable', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const ctx = createTestContext({
        config: { gatewayUrl: 'ws://localhost:3000' },
      });

      const result = await openclawGatewayAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('not reachable');
      globalThis.fetch = originalFetch;
    });
  });
});
