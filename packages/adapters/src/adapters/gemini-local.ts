/**
 * gemini-local adapter — runs Google Gemini CLI as a subprocess.
 *
 * Command: gemini --json
 */

import { runChildProcess } from '../child-process.js';
import type {
  ServerAdapterModule,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentTestResult,
} from '../types.js';
import {
  parseGeminiJsonl,
  extractGeminiUsage,
  extractGeminiCostUsd,
  extractGeminiModel,
  detectGeminiAuthRequired,
  type GeminiEvent,
} from './gemini-jsonl.js';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function buildArgs(ctx: AdapterExecutionContext): string[] {
  const args = ['--json'];

  const model = ctx.config['model'] as string | undefined;
  if (model) {
    args.push('--model', model);
  }

  return args;
}

export const geminiLocalAdapter: ServerAdapterModule = {
  type: 'gemini-local',

  models: [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'google' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' },
  ],

  async execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
    const args = buildArgs(ctx);
    const prompt = (ctx.context['prompt'] as string) ?? '';
    const cwd = (ctx.config['cwd'] as string) ?? undefined;
    const timeoutMs =
      (ctx.config['timeoutMs'] as number) ?? DEFAULT_TIMEOUT_MS;

    const events: GeminiEvent[] = [];
    let stderrOutput = '';

    const { handle, result } = runChildProcess({
      command: 'gemini',
      args,
      cwd,
      stdin: prompt,
      timeoutMs,
      onLog(stream, chunk) {
        ctx.onLog(stream, chunk);

        if (stream === 'stdout') {
          const event = parseGeminiJsonl(chunk);
          if (event) events.push(event);
        } else {
          stderrOutput += chunk + '\n';
        }
      },
    });

    ctx.onSpawn?.({ pid: handle.pid, command: `gemini ${args.join(' ')}` });

    const processResult = await result;

    // Extract data from events
    let costUsd: string | null = null;
    let usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
    let model: string | null = null;
    let summary: string | null = null;

    for (const event of events) {
      const cost = extractGeminiCostUsd(event);
      if (cost) costUsd = cost;

      const eventModel = extractGeminiModel(event);
      if (eventModel) model = eventModel;

      if (event.type === 'result') {
        usage = extractGeminiUsage(event);
      }

      if (event.type === 'assistant' && event.message?.content) {
        const textParts = event.message.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text)
          .join('');
        if (textParts) summary = textParts;
      }

      if (event.type === 'text' && event.text) {
        summary = event.text;
      }

      if (event.type === 'error') {
        summary = event.error ?? event.message ?? 'Unknown error';
      }
    }

    // Detect auth errors
    if (detectGeminiAuthRequired(stderrOutput)) {
      return {
        exitCode: processResult.exitCode,
        signal: processResult.signal,
        timedOut: processResult.timedOut,
        usage,
        sessionId: null,
        sessionParams: null,
        provider: 'google',
        biller: null,
        model,
        billingType: null,
        costUsd: null,
        summary: 'Authentication required — please configure Gemini CLI credentials',
        clearSession: true,
      };
    }

    // Determine billing type
    const billingType: 'api' | 'subscription' | null =
      process.env['GOOGLE_API_KEY'] || process.env['GEMINI_API_KEY']
        ? 'api'
        : 'subscription';

    return {
      exitCode: processResult.exitCode,
      signal: processResult.signal,
      timedOut: processResult.timedOut,
      usage,
      sessionId: null,
      sessionParams: null,
      provider: 'google',
      biller: null,
      model,
      billingType,
      costUsd,
      summary,
      clearSession: processResult.timedOut,
    };
  },

  async testEnvironment(
    _ctx: AdapterExecutionContext,
  ): Promise<AdapterEnvironmentTestResult> {
    try {
      const { result } = runChildProcess({
        command: 'gemini',
        args: ['--version'],
        timeoutMs: 10_000,
      });

      const res = await result;

      if (res.exitCode === 0) {
        return { ok: true };
      }

      return {
        ok: false,
        error: `gemini CLI exited with code ${res.exitCode}`,
      };
    } catch {
      return {
        ok: false,
        error: 'gemini CLI not found — please install Google Gemini CLI',
      };
    }
  },
};
