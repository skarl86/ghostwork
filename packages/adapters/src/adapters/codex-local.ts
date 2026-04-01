/**
 * codex-local adapter — runs OpenAI Codex CLI as a subprocess.
 *
 * Command: codex --quiet --json [--resume <thread_id>]
 */

import { runChildProcess } from '../child-process.js';
import type {
  ServerAdapterModule,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentTestResult,
} from '../types.js';
import {
  parseCodexJsonl,
  extractCodexThreadId,
  extractCodexCostUsd,
  extractCodexUsage,
  isCodexTurnFailed,
  type CodexEvent,
} from './codex-jsonl.js';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function buildArgs(
  ctx: AdapterExecutionContext,
  sessionId: string | null,
): string[] {
  const args = ['--quiet', '--json'];

  if (sessionId) {
    args.push('--resume', sessionId);
  }

  const model = ctx.config['model'] as string | undefined;
  if (model) {
    args.push('--model', model);
  }

  return args;
}

export const codexLocalAdapter: ServerAdapterModule = {
  type: 'codex-local',

  models: [
    { id: 'o3', name: 'o3', provider: 'openai' },
    { id: 'o4-mini', name: 'o4-mini', provider: 'openai' },
    { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai' },
    { id: 'codex-mini-latest', name: 'Codex Mini', provider: 'openai' },
  ],

  async execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
    const sessionId = ctx.runtime.sessionId;
    const args = buildArgs(ctx, sessionId);
    const prompt = (ctx.context['prompt'] as string) ?? '';
    const cwd = (ctx.config['cwd'] as string) ?? undefined;
    const timeoutMs =
      (ctx.config['timeoutMs'] as number) ?? DEFAULT_TIMEOUT_MS;

    const events: CodexEvent[] = [];

    const { handle, result } = runChildProcess({
      command: 'codex',
      args,
      cwd,
      stdin: prompt,
      timeoutMs,
      onLog(stream, chunk) {
        ctx.onLog(stream, chunk);

        if (stream === 'stdout') {
          const event = parseCodexJsonl(chunk);
          if (event) events.push(event);
        }
      },
    });

    ctx.onSpawn?.({ pid: handle.pid, command: `codex ${args.join(' ')}` });

    const processResult = await result;

    // Extract data from events
    let threadId: string | null = null;
    let costUsd: string | null = null;
    let usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
    let model: string | null = null;
    let summary: string | null = null;
    let hasFailed = false;

    for (const event of events) {
      const tid = extractCodexThreadId(event);
      if (tid) threadId = tid;

      const cost = extractCodexCostUsd(event);
      if (cost) costUsd = cost;

      if (event.type === 'turn.completed') {
        usage = extractCodexUsage(event);
        model = (event['model'] as string) ?? model;
      }

      if (event.type === 'item.completed' && event.item?.content) {
        const textParts = event.item.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text)
          .join('');
        if (textParts) summary = textParts;
      }

      if (isCodexTurnFailed(event)) {
        hasFailed = true;
        if (event.type === 'turn.failed') {
          summary = event.error ?? 'Turn failed';
        }
      }
    }

    // Determine billing type
    const billingType: 'api' | 'subscription' | null =
      process.env['OPENAI_API_KEY'] ? 'api' : 'subscription';

    return {
      exitCode: processResult.exitCode,
      signal: processResult.signal,
      timedOut: processResult.timedOut,
      usage,
      sessionId: threadId,
      sessionParams: null,
      provider: 'openai',
      biller: null,
      model,
      billingType,
      costUsd,
      summary,
      clearSession: processResult.timedOut || hasFailed,
    };
  },

  async testEnvironment(
    _ctx: AdapterExecutionContext,
  ): Promise<AdapterEnvironmentTestResult> {
    try {
      const { result } = runChildProcess({
        command: 'codex',
        args: ['--version'],
        timeoutMs: 10_000,
      });

      const res = await result;

      if (res.exitCode === 0) {
        return { ok: true };
      }

      return {
        ok: false,
        error: `codex CLI exited with code ${res.exitCode}`,
      };
    } catch {
      return {
        ok: false,
        error: 'codex CLI not found — please install OpenAI Codex CLI',
      };
    }
  },
};
