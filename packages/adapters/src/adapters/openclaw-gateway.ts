/**
 * openclaw-gateway adapter — connects to OpenClaw Gateway via WebSocket.
 *
 * Unlike other adapters, this does NOT spawn a subprocess.
 * Instead, it establishes a WebSocket connection to the gateway,
 * authenticates with Ed25519 device keys, and sends/receives events.
 */

import { createHash, createPrivateKey, sign } from 'node:crypto';
import type {
  ServerAdapterModule,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentTestResult,
} from '../types.js';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ── Session key strategies ──

type SessionKeyStrategy = 'issue' | 'run' | 'fixed';

function buildSessionKey(
  ctx: AdapterExecutionContext,
  strategy: SessionKeyStrategy,
  fixedKey?: string,
): string {
  switch (strategy) {
    case 'issue':
      return `ghostwork:issue:${ctx.runtime.taskKey}`;
    case 'run':
      return `ghostwork:run:${ctx.runId}`;
    case 'fixed':
      return fixedKey ?? `ghostwork:fixed:${ctx.agent.id}`;
  }
}

// ── Ed25519 Auth ──

function computeDeviceId(publicKeyPem: string): string {
  return createHash('sha256').update(publicKeyPem).digest('hex');
}

function signChallenge(nonce: string, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, Buffer.from(nonce), key);
  return signature.toString('base64');
}

// ── WebSocket message types ──

interface GatewayMessage {
  type: string;
  [key: string]: unknown;
}

interface GatewayStreamEvent {
  stream: 'assistant' | 'error' | 'lifecycle';
  data: string;
}

/**
 * Parse a gateway WebSocket message.
 */
function parseGatewayMessage(data: string): GatewayMessage | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as GatewayMessage;
  } catch {
    return null;
  }
}

// ── WebSocket connection abstraction ──
// Using dynamic import to avoid hard dependency on 'ws' package.
// Callers can also inject a WebSocket factory via config for testing.

type WebSocketLike = {
  on(event: string, handler: (...args: unknown[]) => void): void;
  send(data: string): void;
  close(): void;
  readyState: number;
};

type WebSocketFactory = (url: string) => WebSocketLike;

async function getWebSocketFactory(
  ctx: AdapterExecutionContext,
): Promise<WebSocketFactory> {
  // Allow injection for testing
  const factory = ctx.config['_wsFactory'] as WebSocketFactory | undefined;
  if (factory) return factory;

  // Dynamic import of ws module at runtime (not bundled)
  // The ws package must be installed as a peer dependency
  const modulePath = 'ws';
  const wsModule = (await import(/* webpackIgnore: true */ modulePath)) as {
    default: new (url: string) => WebSocketLike;
  };
  return (url: string) => new wsModule.default(url);
}

export const openclawGatewayAdapter: ServerAdapterModule = {
  type: 'openclaw-gateway',

  async execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
    const gatewayUrl = ctx.config['gatewayUrl'] as string;
    const publicKeyPem = ctx.config['publicKeyPem'] as string;
    const privateKeyPem = ctx.config['privateKeyPem'] as string;
    const sessionKeyStrategy =
      (ctx.config['sessionKeyStrategy'] as SessionKeyStrategy) ?? 'issue';
    const fixedSessionKey = ctx.config['sessionKey'] as string | undefined;
    const timeoutMs =
      (ctx.config['timeoutMs'] as number) ?? DEFAULT_TIMEOUT_MS;

    if (!gatewayUrl) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
        sessionId: null,
        sessionParams: null,
        provider: 'openclaw',
        biller: null,
        model: null,
        billingType: null,
        costUsd: null,
        summary: 'Gateway URL not configured',
        clearSession: false,
      };
    }

    if (!publicKeyPem || !privateKeyPem) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
        sessionId: null,
        sessionParams: null,
        provider: 'openclaw',
        biller: null,
        model: null,
        billingType: null,
        costUsd: null,
        summary: 'Ed25519 keys not configured',
        clearSession: false,
      };
    }

    const sessionKey = buildSessionKey(ctx, sessionKeyStrategy, fixedSessionKey);
    const deviceId = computeDeviceId(publicKeyPem);
    const prompt = (ctx.context['prompt'] as string) ?? '';

    const createWs = await getWebSocketFactory(ctx);

    return new Promise<AdapterExecutionResult>((resolve) => {
      let timedOut = false;
      let assistantOutput = '';
      let sessionId: string | null = sessionKey;
      let resolved = false;

      function resolveOnce(result: AdapterExecutionResult) {
        if (resolved) return;
        resolved = true;
        resolve(result);
      }

      const timer = setTimeout(() => {
        timedOut = true;
        ws.close();
      }, timeoutMs);

      const ws = createWs(gatewayUrl);

      ws.on('open', () => {
        ctx.onLog('stderr', `Connected to gateway: ${gatewayUrl}`);
      });

      ws.on('message', (raw: unknown) => {
        const data = typeof raw === 'string' ? raw : String(raw);
        const msg = parseGatewayMessage(data);
        if (!msg) return;

        ctx.onLog('stdout', data);

        // Handle challenge
        if (msg['type'] === 'connect.challenge') {
          const nonce = msg['nonce'] as string;
          const signature = signChallenge(nonce, privateKeyPem);
          ws.send(
            JSON.stringify({
              type: 'connect',
              deviceId,
              signature,
              autoPairOnFirstConnect: true,
            }),
          );
          return;
        }

        // Handle connected — send the task
        if (msg['type'] === 'connected') {
          ws.send(
            JSON.stringify({
              type: 'task',
              sessionKey,
              prompt,
              context: {
                runId: ctx.runId,
                agentId: ctx.agent.id,
                companyId: ctx.agent.companyId,
              },
            }),
          );
          return;
        }

        // Handle stream events
        if (msg['type'] === 'stream') {
          const streamEvent = msg as unknown as GatewayStreamEvent;
          if (streamEvent.stream === 'assistant') {
            assistantOutput += streamEvent.data;
          }
          return;
        }

        // Handle completion
        if (msg['type'] === 'task.completed') {
          clearTimeout(timer);
          sessionId = (msg['sessionId'] as string) ?? sessionKey;
          ws.close();
          return;
        }

        // Handle error
        if (msg['type'] === 'error') {
          clearTimeout(timer);
          resolveOnce({
            exitCode: 1,
            signal: null,
            timedOut: false,
            usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
            sessionId: null,
            sessionParams: null,
            provider: 'openclaw',
            biller: null,
            model: null,
            billingType: null,
            costUsd: null,
            summary: (msg['error'] as string) ?? 'Gateway error',
            clearSession: false,
          });
          ws.close();
          return;
        }
      });

      ws.on('close', () => {
        clearTimeout(timer);
        resolveOnce({
          exitCode: timedOut ? null : 0,
          signal: timedOut ? 'SIGTERM' : null,
          timedOut,
          usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
          sessionId,
          sessionParams: null,
          provider: 'openclaw',
          biller: null,
          model: null,
          billingType: null,
          costUsd: null,
          summary: assistantOutput || null,
          clearSession: timedOut,
        });
      });

      ws.on('error', (err: unknown) => {
        clearTimeout(timer);
        resolveOnce({
          exitCode: 1,
          signal: null,
          timedOut: false,
          usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
          sessionId: null,
          sessionParams: null,
          provider: 'openclaw',
          biller: null,
          model: null,
          billingType: null,
          costUsd: null,
          summary: `WebSocket error: ${err instanceof Error ? err.message : String(err)}`,
          clearSession: false,
        });
      });
    });
  },

  async testEnvironment(
    ctx: AdapterExecutionContext,
  ): Promise<AdapterEnvironmentTestResult> {
    const gatewayUrl = ctx.config['gatewayUrl'] as string;

    if (!gatewayUrl) {
      return {
        ok: false,
        error: 'Gateway URL not configured',
      };
    }

    // Check if the gateway URL is reachable via HTTP(S)
    const httpUrl = gatewayUrl
      .replace(/^ws:/, 'http:')
      .replace(/^wss:/, 'https:');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);

      const response = await fetch(httpUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Any response means it's reachable
      if (response.ok || response.status < 500) {
        return { ok: true };
      }

      return {
        ok: false,
        error: `Gateway returned status ${response.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        error: `Gateway not reachable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
