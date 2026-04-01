/**
 * process adapter — generic subprocess adapter for arbitrary commands.
 *
 * Config: { command: string, args?: string[], cwd?: string }
 */

import { runChildProcess } from '../child-process.js';
import { buildContextSnapshot } from './env-utils.js';
import type {
  ServerAdapterModule,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentTestResult,
} from '../types.js';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export const processAdapter: ServerAdapterModule = {
  type: 'process',

  async execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
    const command = ctx.config['command'] as string;
    const args = (ctx.config['args'] as string[]) ?? [];
    const cwd = (ctx.config['cwd'] as string) ?? undefined;
    const timeoutMs =
      (ctx.config['timeoutMs'] as number) ?? DEFAULT_TIMEOUT_MS;

    if (!command) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
        sessionId: null,
        sessionParams: null,
        provider: null,
        biller: null,
        model: null,
        billingType: null,
        costUsd: null,
        summary: 'No command specified in adapter config',
        clearSession: false,
      };
    }

    // Build GHOSTWORK_* env vars
    const ghostworkEnv = buildContextSnapshot(ctx);

    // Pass issue prompt as env var
    const prompt = (ctx.context['GHOSTWORK_TASK_PROMPT'] as string) ?? (ctx.context['prompt'] as string) ?? '';
    if (prompt) {
      ghostworkEnv['GHOSTWORK_TASK_PROMPT'] = prompt;
    }

    let lastStdout = '';

    const { handle, result } = runChildProcess({
      command,
      args,
      cwd,
      env: ghostworkEnv,
      stdin: prompt || undefined,
      timeoutMs,
      onLog(stream, chunk) {
        ctx.onLog(stream, chunk);
        if (stream === 'stdout') {
          lastStdout = chunk;
        }
      },
    });

    ctx.onSpawn?.({ pid: handle.pid, command: `${command} ${args.join(' ')}` });

    const processResult = await result;

    return {
      exitCode: processResult.exitCode,
      signal: processResult.signal,
      timedOut: processResult.timedOut,
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      sessionId: null,
      sessionParams: null,
      provider: null,
      biller: null,
      model: null,
      billingType: null,
      costUsd: null,
      summary: lastStdout || null,
      clearSession: false,
    };
  },

  async testEnvironment(
    ctx: AdapterExecutionContext,
  ): Promise<AdapterEnvironmentTestResult> {
    const command = ctx.config['command'] as string;

    if (!command) {
      return { ok: false, error: 'No command specified in adapter config' };
    }

    try {
      const { result } = runChildProcess({
        command: 'which',
        args: [command],
        timeoutMs: 5_000,
      });

      const res = await result;

      if (res.exitCode === 0) {
        return { ok: true };
      }

      return {
        ok: false,
        error: `Command "${command}" not found in PATH`,
      };
    } catch {
      return {
        ok: false,
        error: `Failed to check for command "${command}"`,
      };
    }
  },
};
