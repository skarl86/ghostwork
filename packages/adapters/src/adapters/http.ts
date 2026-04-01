/**
 * http adapter — generic HTTP adapter for REST API agents.
 *
 * Sends a POST request to a configured URL with the execution context,
 * receives a response with the result. Supports streaming (SSE).
 */

import type {
  ServerAdapterModule,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentTestResult,
} from '../types.js';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

interface HttpAdapterResponse {
  exitCode?: number;
  summary?: string;
  sessionId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
  };
  costUsd?: string;
  model?: string;
  provider?: string;
  [key: string]: unknown;
}

/**
 * Parse an SSE line (data: ...) into a string payload.
 */
function parseSseLine(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.startsWith('data: ')) {
    return trimmed.slice(6);
  }
  return null;
}

export const httpAdapter: ServerAdapterModule = {
  type: 'http',

  async execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
    const url = ctx.config['url'] as string;
    const headers = (ctx.config['headers'] as Record<string, string>) ?? {};
    const timeoutMs =
      (ctx.config['timeoutMs'] as number) ?? DEFAULT_TIMEOUT_MS;
    const streaming = (ctx.config['streaming'] as boolean) ?? false;

    if (!url) {
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
        summary: 'No URL specified in adapter config',
        clearSession: false,
      };
    }

    const prompt = (ctx.context['prompt'] as string) ?? '';

    const body = JSON.stringify({
      runId: ctx.runId,
      agentId: ctx.agent.id,
      companyId: ctx.agent.companyId,
      taskKey: ctx.runtime.taskKey,
      sessionId: ctx.runtime.sessionId,
      prompt,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.authToken}`,
          ...headers,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
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
          summary: `HTTP ${response.status}: ${response.statusText}`,
          clearSession: false,
        };
      }

      // Handle SSE streaming response
      if (streaming && response.body) {
        let fullOutput = '';
        let lastResult: HttpAdapterResponse = {};

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const payload = parseSseLine(line);
            if (payload === null) continue;

            ctx.onLog('stdout', payload);

            if (payload === '[DONE]') continue;

            try {
              const parsed = JSON.parse(payload) as HttpAdapterResponse;
              lastResult = { ...lastResult, ...parsed };
              if (parsed.summary) {
                fullOutput += parsed.summary;
              }
            } catch {
              fullOutput += payload;
            }
          }
        }

        return {
          exitCode: lastResult.exitCode ?? 0,
          signal: null,
          timedOut: false,
          usage: {
            inputTokens: lastResult.usage?.inputTokens ?? 0,
            outputTokens: lastResult.usage?.outputTokens ?? 0,
            cachedInputTokens: lastResult.usage?.cachedInputTokens ?? 0,
          },
          sessionId: lastResult.sessionId ?? null,
          sessionParams: null,
          provider: lastResult.provider ?? null,
          biller: null,
          model: lastResult.model ?? null,
          billingType: null,
          costUsd: lastResult.costUsd ?? null,
          summary: fullOutput || null,
          clearSession: false,
        };
      }

      // Handle regular JSON response
      const result = (await response.json()) as HttpAdapterResponse;

      ctx.onLog('stdout', JSON.stringify(result));

      return {
        exitCode: result.exitCode ?? 0,
        signal: null,
        timedOut: false,
        usage: {
          inputTokens: result.usage?.inputTokens ?? 0,
          outputTokens: result.usage?.outputTokens ?? 0,
          cachedInputTokens: result.usage?.cachedInputTokens ?? 0,
        },
        sessionId: result.sessionId ?? null,
        sessionParams: null,
        provider: result.provider ?? null,
        biller: null,
        model: result.model ?? null,
        billingType: null,
        costUsd: result.costUsd ?? null,
        summary: result.summary ?? null,
        clearSession: false,
      };
    } catch (err) {
      clearTimeout(timer);

      const isAbort =
        err instanceof Error && err.name === 'AbortError';

      return {
        exitCode: null,
        signal: isAbort ? 'SIGTERM' : null,
        timedOut: isAbort,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
        sessionId: null,
        sessionParams: null,
        provider: null,
        biller: null,
        model: null,
        billingType: null,
        costUsd: null,
        summary: isAbort
          ? 'Request timed out'
          : `HTTP error: ${err instanceof Error ? err.message : String(err)}`,
        clearSession: isAbort,
      };
    }
  },

  async testEnvironment(
    ctx: AdapterExecutionContext,
  ): Promise<AdapterEnvironmentTestResult> {
    const url = ctx.config['url'] as string;

    if (!url) {
      return {
        ok: false,
        error: 'No URL specified in adapter config',
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok || response.status < 500) {
        return { ok: true };
      }

      return {
        ok: false,
        error: `URL returned status ${response.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        error: `URL not reachable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
