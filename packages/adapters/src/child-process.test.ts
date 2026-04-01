import { describe, it, expect } from 'vitest';
import { runChildProcess } from './child-process.js';

describe('runChildProcess', () => {
  it('runs echo command and captures stdout', async () => {
    const logs: Array<{ stream: string; chunk: string }> = [];

    const { handle, result } = runChildProcess({
      command: 'echo',
      args: ['hello world'],
      onLog(stream, chunk) {
        logs.push({ stream, chunk });
      },
    });

    expect(handle.pid).toBeTypeOf('number');

    const res = await result;

    expect(res.exitCode).toBe(0);
    expect(res.signal).toBeNull();
    expect(res.timedOut).toBe(false);
    expect(logs.some((l) => l.stream === 'stdout' && l.chunk.includes('hello world'))).toBe(true);
  });

  it('captures stderr output', async () => {
    const logs: Array<{ stream: string; chunk: string }> = [];

    const { result } = runChildProcess({
      command: 'sh',
      args: ['-c', 'echo "error msg" >&2'],
      onLog(stream, chunk) {
        logs.push({ stream, chunk });
      },
    });

    await result;

    expect(logs.some((l) => l.stream === 'stderr' && l.chunk.includes('error msg'))).toBe(true);
  });

  it('returns non-zero exit code for failing command', async () => {
    const { result } = runChildProcess({
      command: 'sh',
      args: ['-c', 'exit 42'],
    });

    const res = await result;

    expect(res.exitCode).toBe(42);
    expect(res.timedOut).toBe(false);
  });

  it('passes stdin to the process', async () => {
    const logs: Array<{ stream: string; chunk: string }> = [];

    const { result } = runChildProcess({
      command: 'cat',
      stdin: 'piped input',
      onLog(stream, chunk) {
        logs.push({ stream, chunk });
      },
    });

    await result;

    expect(logs.some((l) => l.stream === 'stdout' && l.chunk.includes('piped input'))).toBe(true);
  });

  it('handles timeout with SIGTERM', async () => {
    const { result } = runChildProcess({
      command: 'sleep',
      args: ['60'],
      timeoutMs: 200,
    });

    const res = await result;

    expect(res.timedOut).toBe(true);
    // Process should be killed
    expect(res.exitCode === null || res.signal !== null).toBe(true);
  }, 10_000);

  it('passes environment variables', async () => {
    const logs: Array<{ stream: string; chunk: string }> = [];

    const { result } = runChildProcess({
      command: 'sh',
      args: ['-c', 'echo "$MY_TEST_VAR"'],
      env: { MY_TEST_VAR: 'test_value_123' },
      onLog(stream, chunk) {
        logs.push({ stream, chunk });
      },
    });

    await result;

    expect(
      logs.some((l) => l.stream === 'stdout' && l.chunk.includes('test_value_123')),
    ).toBe(true);
  });

  it('kill() terminates the process', async () => {
    const { handle, result } = runChildProcess({
      command: 'sleep',
      args: ['60'],
    });

    // Give it a moment to start
    await new Promise((r) => setTimeout(r, 100));

    handle.kill();

    const res = await result;

    expect(res.exitCode === null || res.signal !== null).toBe(true);
  }, 10_000);

  it('works with cwd option', async () => {
    const logs: Array<{ stream: string; chunk: string }> = [];

    const { result } = runChildProcess({
      command: 'pwd',
      cwd: '/tmp',
      onLog(stream, chunk) {
        logs.push({ stream, chunk });
      },
    });

    await result;

    expect(
      logs.some((l) => l.stream === 'stdout' && l.chunk.includes('/tmp')),
    ).toBe(true);
  });

  it('handles multiline stdout', async () => {
    const logs: Array<{ stream: string; chunk: string }> = [];

    const { result } = runChildProcess({
      command: 'sh',
      args: ['-c', 'echo "line1"; echo "line2"; echo "line3"'],
      onLog(stream, chunk) {
        logs.push({ stream, chunk });
      },
    });

    await result;

    const stdoutChunks = logs.filter((l) => l.stream === 'stdout').map((l) => l.chunk);
    expect(stdoutChunks).toContain('line1');
    expect(stdoutChunks).toContain('line2');
    expect(stdoutChunks).toContain('line3');
  });
});
