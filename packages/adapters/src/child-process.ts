/**
 * runChildProcess — spawn a subprocess with streaming, timeout, and PID tracking.
 */

import { spawn } from 'node:child_process';
import type {
  RunChildProcessOptions,
  RunChildProcessResult,
  ChildProcessHandle,
  ProcessHandle,
} from './types.js';

const KILL_GRACE_MS = 5_000;

/**
 * Spawn a child process with:
 * - stdout/stderr streaming via onLog
 * - Timeout handling (SIGTERM → wait grace → SIGKILL)
 * - PID tracking
 *
 * Returns a ProcessHandle (for kill) + a result Promise.
 */
export function runChildProcess(options: RunChildProcessOptions): ChildProcessHandle {
  const {
    command,
    args = [],
    cwd,
    env,
    stdin,
    timeoutMs,
    onLog,
  } = options;

  const proc = spawn(command, args, {
    cwd,
    env: env ? { ...process.env, ...env } : undefined,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const handle: ProcessHandle = {
    pid: proc.pid ?? null,
    kill: () => {
      if (!proc.killed) {
        proc.kill('SIGTERM');
      }
    },
    process: proc,
  };

  // Write to stdin if provided
  if (stdin != null && proc.stdin) {
    proc.stdin.write(stdin);
    proc.stdin.end();
  }

  // Stream stdout
  if (proc.stdout && onLog) {
    let stdoutBuffer = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      // Keep the last (possibly incomplete) line in buffer
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.length > 0) {
          onLog('stdout', line);
        }
      }
    });
    proc.stdout.on('end', () => {
      if (stdoutBuffer.length > 0) {
        onLog('stdout', stdoutBuffer);
        stdoutBuffer = '';
      }
    });
  }

  // Stream stderr
  if (proc.stderr && onLog) {
    let stderrBuffer = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.length > 0) {
          onLog('stderr', line);
        }
      }
    });
    proc.stderr.on('end', () => {
      if (stderrBuffer.length > 0) {
        onLog('stderr', stderrBuffer);
        stderrBuffer = '';
      }
    });
  }

  const result = new Promise<RunChildProcessResult>((resolve) => {
    let timedOut = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    // Timeout handling
    if (timeoutMs != null && timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');

        // Force kill after grace period
        killTimer = setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, KILL_GRACE_MS);
      }, timeoutMs);
    }

    proc.on('close', (code, signal) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);

      resolve({
        exitCode: code,
        signal: signal ?? null,
        timedOut,
      });
    });

    proc.on('error', (_err) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);

      resolve({
        exitCode: null,
        signal: null,
        timedOut: false,
      });
    });
  });

  return { handle, result };
}
