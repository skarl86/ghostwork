import { describe, it, expect } from 'vitest';
import { processAdapter } from './process.js';
import { createTestContext } from '../testing.js';

describe('process adapter', () => {
  describe('execute', () => {
    it('runs echo command and returns stdout as summary', async () => {
      const logs: Array<{ stream: string; chunk: string }> = [];
      const ctx = createTestContext({
        config: { command: 'echo', args: ['hello from process'] },
        onLog(stream, chunk) {
          logs.push({ stream, chunk });
        },
      });

      const result = await processAdapter.execute(ctx);

      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(result.summary).toContain('hello from process');
      expect(result.sessionId).toBeNull();
      expect(result.provider).toBeNull();
    });

    it('returns exit code for failing command', async () => {
      const ctx = createTestContext({
        config: { command: 'sh', args: ['-c', 'exit 7'] },
      });

      const result = await processAdapter.execute(ctx);

      expect(result.exitCode).toBe(7);
    });

    it('returns error when no command specified', async () => {
      const ctx = createTestContext({ config: {} });

      const result = await processAdapter.execute(ctx);

      expect(result.exitCode).toBe(1);
      expect(result.summary).toContain('No command specified');
    });

    it('passes GHOSTWORK_* env vars', async () => {
      const logs: Array<{ stream: string; chunk: string }> = [];
      const ctx = createTestContext({
        config: {
          command: 'sh',
          args: ['-c', 'echo "RUN=$GHOSTWORK_RUN_ID"'],
        },
        runId: 'run-42',
        onLog(stream, chunk) {
          logs.push({ stream, chunk });
        },
      });

      const result = await processAdapter.execute(ctx);

      expect(result.exitCode).toBe(0);
      const stdoutLogs = logs
        .filter((l) => l.stream === 'stdout')
        .map((l) => l.chunk);
      expect(stdoutLogs.some((l) => l.includes('RUN=run-42'))).toBe(true);
    });

    it('calls onSpawn with pid info', async () => {
      const spawnCalls: Array<{ pid: number | null; command: string }> = [];
      const ctx = createTestContext({
        config: { command: 'echo', args: ['test'] },
        onSpawn(info) {
          spawnCalls.push(info);
        },
      });

      await processAdapter.execute(ctx);

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]!.pid).toBeTypeOf('number');
      expect(spawnCalls[0]!.command).toContain('echo');
    });

    it('usage is always zero (no token tracking)', async () => {
      const ctx = createTestContext({
        config: { command: 'echo', args: ['test'] },
      });

      const result = await processAdapter.execute(ctx);

      expect(result.usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
      });
    });
  });

  describe('testEnvironment', () => {
    it('returns ok for existing command', async () => {
      const ctx = createTestContext({
        config: { command: 'echo' },
      });

      const result = await processAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(true);
    });

    it('returns error for non-existent command', async () => {
      const ctx = createTestContext({
        config: { command: 'nonexistent_command_xyz_123' },
      });

      const result = await processAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error when no command specified', async () => {
      const ctx = createTestContext({ config: {} });

      const result = await processAdapter.testEnvironment(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('No command');
    });
  });
});
