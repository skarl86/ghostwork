import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geminiLocalAdapter } from './gemini-local.js';
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

describe('gemini-local adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('type', () => {
    it('has correct type identifier', () => {
      expect(geminiLocalAdapter.type).toBe('gemini-local');
    });
  });

  describe('execute', () => {
    it('runs gemini with --json flag', async () => {
      mockRunChildProcess.mockReturnValue({
        handle: createMockHandle(),
        result: createMockResult(),
      });

      const ctx = createTestContext({
        context: { prompt: 'Explain this code' },
      });

      await geminiLocalAdapter.execute(ctx);

      expect(mockRunChildProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'gemini',
          args: expect.arrayContaining(['--json']),
          stdin: 'Explain this code',
        }),
      );
    });

    it('passes --model when specified in config', async () => {
      mockRunChildProcess.mockReturnValue({
        handle: createMockHandle(),
        result: createMockResult(),
      });

      const ctx = createTestContext({
        config: { model: 'gemini-2.5-pro' },
      });

      await geminiLocalAdapter.execute(ctx);

      expect(mockRunChildProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining(['--model', 'gemini-2.5-pro']),
        }),
      );
    });

    it('extracts usage and cost from result events', async () => {
      mockRunChildProcess.mockImplementation((opts) => {
        if (opts.onLog) {
          opts.onLog('stdout', JSON.stringify({
            type: 'result',
            usage: { input_tokens: 150, output_tokens: 75 },
            model: 'gemini-2.5-pro',
            cost_usd: '0.002',
          }));
        }
        return {
          handle: createMockHandle(),
          result: createMockResult(),
        };
      });

      const ctx = createTestContext();
      const result = await geminiLocalAdapter.execute(ctx);

      expect(result.costUsd).toBe('0.002');
      expect(result.model).toBe('gemini-2.5-pro');
      expect(result.usage.inputTokens).toBe(150);
      expect(result.usage.outputTokens).toBe(75);
    });

    it('captures assistant text as summary', async () => {
      mockRunChildProcess.mockImplementation((opts) => {
        if (opts.onLog) {
          opts.onLog('stdout', JSON.stringify({
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'Done!' }] },
          }));
        }
        return {
          handle: createMockHandle(),
          result: createMockResult(),
        };
      });

      const ctx = createTestContext();
      const result = await geminiLocalAdapter.execute(ctx);

      expect(result.summary).toBe('Done!');
    });

    it('captures text events as summary', async () => {
      mockRunChildProcess.mockImplementation((opts) => {
        if (opts.onLog) {
          opts.onLog('stdout', JSON.stringify({ type: 'text', text: 'Output text' }));
        }
        return {
          handle: createMockHandle(),
          result: createMockResult(),
        };
      });

      const ctx = createTestContext();
      const result = await geminiLocalAdapter.execute(ctx);

      expect(result.summary).toBe('Output text');
    });

    it('detects auth errors from stderr', async () => {
      mockRunChildProcess.mockImplementation((opts) => {
        if (opts.onLog) {
          opts.onLog('stderr', 'Please log in to continue');
        }
        return {
          handle: createMockHandle(),
          result: createMockResult(1),
        };
      });

      const ctx = createTestContext();
      const result = await geminiLocalAdapter.execute(ctx);

      expect(result.summary).toContain('Authentication required');
      expect(result.clearSession).toBe(true);
    });

    it('returns provider as google', async () => {
      mockRunChildProcess.mockReturnValue({
        handle: createMockHandle(),
        result: createMockResult(),
      });

      const ctx = createTestContext();
      const result = await geminiLocalAdapter.execute(ctx);

      expect(result.provider).toBe('google');
    });

    it('captures error events as summary', async () => {
      mockRunChildProcess.mockImplementation((opts) => {
        if (opts.onLog) {
          opts.onLog('stdout', JSON.stringify({ type: 'error', error: 'Model not found' }));
        }
        return {
          handle: createMockHandle(),
          result: createMockResult(1),
        };
      });

      const ctx = createTestContext();
      const result = await geminiLocalAdapter.execute(ctx);

      expect(result.summary).toBe('Model not found');
    });

    it('calls onSpawn with pid info', async () => {
      mockRunChildProcess.mockReturnValue({
        handle: createMockHandle(5555),
        result: createMockResult(),
      });

      const spawnCalls: Array<{ pid: number | null; command: string }> = [];
      const ctx = createTestContext({
        onSpawn(info) {
          spawnCalls.push(info);
        },
      });

      await geminiLocalAdapter.execute(ctx);

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]!.pid).toBe(5555);
      expect(spawnCalls[0]!.command).toContain('gemini');
    });

    it('sets clearSession on timeout', async () => {
      mockRunChildProcess.mockReturnValue({
        handle: createMockHandle(),
        result: createMockResult(null, 'SIGTERM', true),
      });

      const ctx = createTestContext();
      const result = await geminiLocalAdapter.execute(ctx);

      expect(result.timedOut).toBe(true);
      expect(result.clearSession).toBe(true);
    });
  });

  describe('testEnvironment', () => {
    it('returns ok when gemini CLI is available', async () => {
      mockRunChildProcess.mockReturnValue({
        handle: createMockHandle(),
        result: createMockResult(0),
      });

      const ctx = createTestContext();
      const result = await geminiLocalAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(true);
    });

    it('returns error when gemini CLI exits non-zero', async () => {
      mockRunChildProcess.mockReturnValue({
        handle: createMockHandle(),
        result: createMockResult(1),
      });

      const ctx = createTestContext();
      const result = await geminiLocalAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('gemini CLI');
    });

    it('returns error when gemini CLI not found', async () => {
      mockRunChildProcess.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const ctx = createTestContext();
      const result = await geminiLocalAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});
