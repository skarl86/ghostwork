/**
 * Mock adapters for testing — use in heartbeat engine and integration tests.
 */

import type {
  ServerAdapterModule,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentTestResult,
} from './types.js';

const DEFAULT_SUCCESS_RESULT: AdapterExecutionResult = {
  exitCode: 0,
  signal: null,
  timedOut: false,
  usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: 0 },
  sessionId: 'mock-session-1',
  sessionParams: null,
  provider: 'mock',
  biller: null,
  model: 'mock-model',
  billingType: 'api',
  costUsd: '0.001',
  summary: 'Mock execution completed',
  clearSession: false,
};

/**
 * Create a mock adapter that succeeds immediately with configurable result.
 */
export function createMockAdapter(
  overrides?: Partial<AdapterExecutionResult>,
): ServerAdapterModule {
  const result: AdapterExecutionResult = { ...DEFAULT_SUCCESS_RESULT, ...overrides };

  return {
    type: 'mock',

    async execute(_ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
      return { ...result };
    },

    async testEnvironment(
      _ctx: AdapterExecutionContext,
    ): Promise<AdapterEnvironmentTestResult> {
      return { ok: true };
    },
  };
}

/**
 * Create a mock adapter that returns a failure result.
 */
export function createFailingAdapter(
  error = 'Mock execution failed',
): ServerAdapterModule {
  return {
    type: 'mock-failing',

    async execute(_ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
        sessionId: null,
        sessionParams: null,
        provider: 'mock',
        biller: null,
        model: null,
        billingType: null,
        costUsd: null,
        summary: error,
        clearSession: false,
      };
    },

    async testEnvironment(
      _ctx: AdapterExecutionContext,
    ): Promise<AdapterEnvironmentTestResult> {
      return { ok: false, error: 'Mock environment check failed' };
    },
  };
}

/**
 * Create a mock adapter that simulates a timeout.
 */
export function createTimeoutAdapter(
  delayMs = 0,
): ServerAdapterModule {
  return {
    type: 'mock-timeout',

    async execute(_ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      return {
        exitCode: null,
        signal: 'SIGTERM',
        timedOut: true,
        usage: { inputTokens: 50, outputTokens: 0, cachedInputTokens: 0 },
        sessionId: null,
        sessionParams: null,
        provider: 'mock',
        biller: null,
        model: null,
        billingType: null,
        costUsd: null,
        summary: null,
        clearSession: true,
      };
    },

    async testEnvironment(
      _ctx: AdapterExecutionContext,
    ): Promise<AdapterEnvironmentTestResult> {
      return { ok: true };
    },
  };
}

/**
 * Create a mock adapter that throws an error during execution.
 */
export function createThrowingAdapter(
  error = 'Adapter crashed',
): ServerAdapterModule {
  return {
    type: 'mock-throwing',

    async execute(_ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
      throw new Error(error);
    },

    async testEnvironment(
      _ctx: AdapterExecutionContext,
    ): Promise<AdapterEnvironmentTestResult> {
      return { ok: true };
    },
  };
}

/**
 * Helper to create a minimal AdapterExecutionContext for testing.
 */
export function createTestContext(
  overrides: Partial<AdapterExecutionContext> = {},
): AdapterExecutionContext {
  return {
    runId: overrides.runId ?? 'test-run-1',
    agent: overrides.agent ?? {
      id: 'test-agent-1',
      companyId: 'test-company-1',
      name: 'TestAgent',
      adapterType: 'mock',
    },
    runtime: overrides.runtime ?? {
      sessionId: null,
      sessionParams: null,
      taskKey: 'test-task',
    },
    config: overrides.config ?? {},
    context: overrides.context ?? {},
    onLog: overrides.onLog ?? (() => {}),
    onMeta: overrides.onMeta ?? (() => {}),
    onSpawn: overrides.onSpawn ?? (() => {}),
    authToken: overrides.authToken ?? 'test-token',
  };
}
