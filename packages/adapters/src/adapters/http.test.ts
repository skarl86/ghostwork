import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { httpAdapter } from './http.js';
import { createTestContext } from '../testing.js';

describe('http adapter', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('type', () => {
    it('has correct type identifier', () => {
      expect(httpAdapter.type).toBe('http');
    });
  });

  describe('execute', () => {
    it('returns error when no URL specified', async () => {
      const ctx = createTestContext({ config: {} });

      const result = await httpAdapter.execute(ctx);

      expect(result.exitCode).toBe(1);
      expect(result.summary).toContain('No URL specified');
    });

    it('sends POST with correct body', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ summary: 'Done', exitCode: 0 }),
      });

      const ctx = createTestContext({
        config: { url: 'https://api.example.com/agent' },
        context: { prompt: 'Fix the bug' },
        runId: 'run-1',
      });

      await httpAdapter.execute(ctx);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.example.com/agent',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );

      // Check the body
      const callArgs = vi.mocked(globalThis.fetch).mock.calls[0]!;
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.prompt).toBe('Fix the bug');
      expect(body.runId).toBe('run-1');
    });

    it('includes custom headers', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ summary: 'Done' }),
      });

      const ctx = createTestContext({
        config: {
          url: 'https://api.example.com/agent',
          headers: { 'X-Custom': 'value' },
        },
      });

      await httpAdapter.execute(ctx);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom': 'value',
          }),
        }),
      );
    });

    it('parses JSON response correctly', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            summary: 'Task completed',
            exitCode: 0,
            sessionId: 'sess-1',
            model: 'gpt-4',
            provider: 'openai',
            costUsd: '0.01',
            usage: { inputTokens: 100, outputTokens: 50 },
          }),
      });

      const ctx = createTestContext({
        config: { url: 'https://api.example.com/agent' },
      });

      const result = await httpAdapter.execute(ctx);

      expect(result.exitCode).toBe(0);
      expect(result.summary).toBe('Task completed');
      expect(result.sessionId).toBe('sess-1');
      expect(result.model).toBe('gpt-4');
      expect(result.provider).toBe('openai');
      expect(result.costUsd).toBe('0.01');
      expect(result.usage.inputTokens).toBe(100);
      expect(result.usage.outputTokens).toBe(50);
    });

    it('handles HTTP error responses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const ctx = createTestContext({
        config: { url: 'https://api.example.com/agent' },
      });

      const result = await httpAdapter.execute(ctx);

      expect(result.exitCode).toBe(1);
      expect(result.summary).toContain('HTTP 500');
    });

    it('handles network errors', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const ctx = createTestContext({
        config: { url: 'https://api.example.com/agent' },
      });

      const result = await httpAdapter.execute(ctx);

      expect(result.exitCode).toBeNull();
      expect(result.summary).toContain('HTTP error');
      expect(result.summary).toContain('ECONNREFUSED');
    });

    it('handles timeout (AbortError)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      const ctx = createTestContext({
        config: { url: 'https://api.example.com/agent', timeoutMs: 100 },
      });

      const result = await httpAdapter.execute(ctx);

      expect(result.timedOut).toBe(true);
      expect(result.signal).toBe('SIGTERM');
      expect(result.summary).toContain('timed out');
      expect(result.clearSession).toBe(true);
    });

    it('logs response to onLog', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ summary: 'Done' }),
      });

      const logs: Array<{ stream: string; chunk: string }> = [];
      const ctx = createTestContext({
        config: { url: 'https://api.example.com/agent' },
        onLog(stream, chunk) {
          logs.push({ stream, chunk });
        },
      });

      await httpAdapter.execute(ctx);

      const stdoutLogs = logs.filter((l) => l.stream === 'stdout');
      expect(stdoutLogs).toHaveLength(1);
    });

    it('includes auth token in Authorization header', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ summary: 'Done' }),
      });

      const ctx = createTestContext({
        config: { url: 'https://api.example.com/agent' },
        authToken: 'my-jwt-token',
      });

      await httpAdapter.execute(ctx);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-jwt-token',
          }),
        }),
      );
    });

    it('defaults missing response fields', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const ctx = createTestContext({
        config: { url: 'https://api.example.com/agent' },
      });

      const result = await httpAdapter.execute(ctx);

      expect(result.exitCode).toBe(0);
      expect(result.summary).toBeNull();
      expect(result.sessionId).toBeNull();
      expect(result.model).toBeNull();
      expect(result.costUsd).toBeNull();
      expect(result.usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
      });
    });
  });

  describe('testEnvironment', () => {
    it('returns error when no URL specified', async () => {
      const ctx = createTestContext({ config: {} });

      const result = await httpAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('No URL');
    });

    it('returns ok when URL is reachable', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const ctx = createTestContext({
        config: { url: 'https://api.example.com/agent' },
      });

      const result = await httpAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(true);
    });

    it('returns ok for non-500 status codes', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const ctx = createTestContext({
        config: { url: 'https://api.example.com/agent' },
      });

      const result = await httpAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(true);
    });

    it('returns error for 500+ status codes', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      });

      const ctx = createTestContext({
        config: { url: 'https://api.example.com/agent' },
      });

      const result = await httpAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('503');
    });

    it('returns error when URL not reachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const ctx = createTestContext({
        config: { url: 'https://api.example.com/agent' },
      });

      const result = await httpAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('not reachable');
    });
  });
});
