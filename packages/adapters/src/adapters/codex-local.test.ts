import { describe, it, expect, vi, beforeEach } from 'vitest';
import { codexLocalAdapter } from './codex-local.js';
import { createTestContext } from '../testing.js';

// Mock child-process module
vi.mock('../child-process.js', () => ({
  runChildProcess: vi.fn(),
}));

import { runChildProcess } from '../child-process.js';

const mockRunChildProcess = vi.mocked(runChildProcess);

function createMockHandle(pid = 1234) {
  return {
    pid,
    kill: vi.fn(),
  };
}

function createMockResult(
  exitCode: number | null = 0,
  signal: string | null = null,
  timedOut = false,
) {
  return Promise.resolve({ exitCode, signal, timedOut });
}

describe('codex-local adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('type', () => {
    it('has correct type identifier', () => {
      expect(codexLocalAdapter.type).toBe('codex-local');
    });
  });

  describe('execute', () => {
    it('runs codex with --quiet --json flags', async () => {
      mockRunChildProcess.mockReturnValue({
        handle: createMockHandle(),
        result: createMockResult(),
      });

      const ctx = createTestContext({
        context: { prompt: 'Fix the bug' },
      });

      await codexLocalAdapter.execute(ctx);

      expect(mockRunChildProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'codex',
          args: expect.arrayContaining(['--quiet', '--json']),
          stdin: 'Fix the bug',
        }),
      );
    });

    it('passes --resume when sessionId is set', async () => {
      mockRunChildProcess.mockReturnValue({
        handle: createMockHandle(),
        result: createMockResult(),
      });

      const ctx = createTestContext({
        runtime: {
          sessionId: 'thread-abc',
          sessionParams: null,
          taskKey: 'test-task',
        },
      });

      await codexLocalAdapter.execute(ctx);

      expect(mockRunChildProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining(['--resume', 'thread-abc']),
        }),
      );
    });

    it('passes --model when specified in config', async () => {
      mockRunChildProcess.mockReturnValue({
        handle: createMockHandle(),
        result: createMockResult(),
      });

      const ctx = createTestContext({
        config: { model: 'codex-mini-latest' },
      });

      await codexLocalAdapter.execute(ctx);

      expect(mockRunChildProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining(['--model', 'codex-mini-latest']),
        }),
      );
    });

    it('extracts thread_id from events as sessionId', async () => {
      mockRunChildProcess.mockImplementation((opts) => {
        // Simulate JSONL output via onLog
        if (opts.onLog) {
          opts.onLog('stdout', JSON.stringify({ type: 'thread.started', thread_id: 'thread-xyz' }));
          opts.onLog('stdout', JSON.stringify({ type: 'turn.completed', thread_id: 'thread-xyz', usage: { input_tokens: 100, output_tokens: 50 }, cost_usd: '0.003' }));
        }
        return {
          handle: createMockHandle(),
          result: createMockResult(),
        };
      });

      const ctx = createTestContext();
      const result = await codexLocalAdapter.execute(ctx);

      expect(result.sessionId).toBe('thread-xyz');
      expect(result.costUsd).toBe('0.003');
      expect(result.usage.inputTokens).toBe(100);
      expect(result.usage.outputTokens).toBe(50);
    });

    it('handles turn.failed events', async () => {
      mockRunChildProcess.mockImplementation((opts) => {
        if (opts.onLog) {
          opts.onLog('stdout', JSON.stringify({ type: 'turn.failed', error: 'Rate limit' }));
        }
        return {
          handle: createMockHandle(),
          result: createMockResult(1),
        };
      });

      const ctx = createTestContext();
      const result = await codexLocalAdapter.execute(ctx);

      expect(result.exitCode).toBe(1);
      expect(result.summary).toBe('Rate limit');
      expect(result.clearSession).toBe(true);
    });

    it('returns provider as openai', async () => {
      mockRunChildProcess.mockReturnValue({
        handle: createMockHandle(),
        result: createMockResult(),
      });

      const ctx = createTestContext();
      const result = await codexLocalAdapter.execute(ctx);

      expect(result.provider).toBe('openai');
    });

    it('calls onSpawn with pid info', async () => {
      mockRunChildProcess.mockReturnValue({
        handle: createMockHandle(9999),
        result: createMockResult(),
      });

      const spawnCalls: Array<{ pid: number | null; command: string }> = [];
      const ctx = createTestContext({
        onSpawn(info) {
          spawnCalls.push(info);
        },
      });

      await codexLocalAdapter.execute(ctx);

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]!.pid).toBe(9999);
      expect(spawnCalls[0]!.command).toContain('codex');
    });

    it('sets clearSession on timeout', async () => {
      mockRunChildProcess.mockReturnValue({
        handle: createMockHandle(),
        result: createMockResult(null, 'SIGTERM', true),
      });

      const ctx = createTestContext();
      const result = await codexLocalAdapter.execute(ctx);

      expect(result.timedOut).toBe(true);
      expect(result.clearSession).toBe(true);
    });
  });

  describe('testEnvironment', () => {
    it('returns ok when codex CLI is available', async () => {
      mockRunChildProcess.mockReturnValue({
        handle: createMockHandle(),
        result: createMockResult(0),
      });

      const ctx = createTestContext();
      const result = await codexLocalAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(true);
    });

    it('returns error when codex CLI exits non-zero', async () => {
      mockRunChildProcess.mockReturnValue({
        handle: createMockHandle(),
        result: createMockResult(1),
      });

      const ctx = createTestContext();
      const result = await codexLocalAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('codex CLI');
    });

    it('returns error when codex CLI not found', async () => {
      mockRunChildProcess.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const ctx = createTestContext();
      const result = await codexLocalAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});
