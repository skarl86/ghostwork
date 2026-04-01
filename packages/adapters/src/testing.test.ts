import { describe, it, expect } from 'vitest';
import {
  createMockAdapter,
  createFailingAdapter,
  createTimeoutAdapter,
  createThrowingAdapter,
  createTestContext,
} from './testing.js';

describe('Mock Adapters', () => {
  const ctx = createTestContext();

  describe('createMockAdapter', () => {
    it('succeeds with default result', async () => {
      const adapter = createMockAdapter();

      const result = await adapter.execute(ctx);

      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(result.sessionId).toBe('mock-session-1');
      expect(result.costUsd).toBe('0.001');
      expect(result.summary).toBe('Mock execution completed');
    });

    it('accepts result overrides', async () => {
      const adapter = createMockAdapter({
        costUsd: '0.05',
        model: 'custom-model',
      });

      const result = await adapter.execute(ctx);

      expect(result.costUsd).toBe('0.05');
      expect(result.model).toBe('custom-model');
      expect(result.exitCode).toBe(0); // default preserved
    });

    it('testEnvironment returns ok', async () => {
      const adapter = createMockAdapter();

      const envResult = await adapter.testEnvironment(ctx);

      expect(envResult.ok).toBe(true);
    });
  });

  describe('createFailingAdapter', () => {
    it('returns exit code 1', async () => {
      const adapter = createFailingAdapter();

      const result = await adapter.execute(ctx);

      expect(result.exitCode).toBe(1);
      expect(result.summary).toBe('Mock execution failed');
    });

    it('accepts custom error message', async () => {
      const adapter = createFailingAdapter('Custom failure');

      const result = await adapter.execute(ctx);

      expect(result.summary).toBe('Custom failure');
    });

    it('testEnvironment returns not ok', async () => {
      const adapter = createFailingAdapter();

      const envResult = await adapter.testEnvironment(ctx);

      expect(envResult.ok).toBe(false);
    });
  });

  describe('createTimeoutAdapter', () => {
    it('returns timedOut: true', async () => {
      const adapter = createTimeoutAdapter();

      const result = await adapter.execute(ctx);

      expect(result.timedOut).toBe(true);
      expect(result.signal).toBe('SIGTERM');
      expect(result.exitCode).toBeNull();
      expect(result.clearSession).toBe(true);
    });
  });

  describe('createThrowingAdapter', () => {
    it('throws error during execute', async () => {
      const adapter = createThrowingAdapter('Kaboom');

      await expect(adapter.execute(ctx)).rejects.toThrow('Kaboom');
    });

    it('uses default error message', async () => {
      const adapter = createThrowingAdapter();

      await expect(adapter.execute(ctx)).rejects.toThrow('Adapter crashed');
    });
  });
});

describe('createTestContext', () => {
  it('creates context with sensible defaults', () => {
    const ctx = createTestContext();

    expect(ctx.runId).toBe('test-run-1');
    expect(ctx.agent.id).toBe('test-agent-1');
    expect(ctx.agent.companyId).toBe('test-company-1');
    expect(ctx.runtime.sessionId).toBeNull();
    expect(ctx.authToken).toBe('test-token');
    expect(typeof ctx.onLog).toBe('function');
  });

  it('accepts overrides', () => {
    const ctx = createTestContext({
      runId: 'custom-run',
      runtime: {
        sessionId: 'sess-1',
        sessionParams: null,
        taskKey: 'my-task',
      },
    });

    expect(ctx.runId).toBe('custom-run');
    expect(ctx.runtime.sessionId).toBe('sess-1');
    expect(ctx.runtime.taskKey).toBe('my-task');
  });
});
