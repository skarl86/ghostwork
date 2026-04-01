import { describe, it, expect } from 'vitest';
import {
  createAdapterRegistry,
  createMockAdapter,
  createTestContext,
  claudeLocalAdapter,
  codexLocalAdapter,
  geminiLocalAdapter,
  openclawGatewayAdapter,
  httpAdapter,
  processAdapter,
} from './index.js';

describe('@ghostwork/adapters barrel exports', () => {
  it('exports createAdapterRegistry', () => {
    const registry = createAdapterRegistry();
    expect(typeof registry.register).toBe('function');
    expect(typeof registry.get).toBe('function');
    expect(typeof registry.list).toBe('function');
  });

  it('exports built-in adapters', () => {
    expect(claudeLocalAdapter.type).toBe('claude-local');
    expect(codexLocalAdapter.type).toBe('codex-local');
    expect(geminiLocalAdapter.type).toBe('gemini-local');
    expect(openclawGatewayAdapter.type).toBe('openclaw-gateway');
    expect(httpAdapter.type).toBe('http');
    expect(processAdapter.type).toBe('process');
  });

  it('exports mock adapter utilities', () => {
    const adapter = createMockAdapter();
    expect(adapter.type).toBe('mock');

    const ctx = createTestContext();
    expect(ctx.runId).toBe('test-run-1');
  });

  it('full round-trip: register → get → execute', async () => {
    const registry = createAdapterRegistry();
    const adapter = createMockAdapter();

    registry.register(adapter);

    const resolved = registry.get('mock')!;
    const ctx = createTestContext();
    const result = await resolved.execute(ctx);

    expect(result.exitCode).toBe(0);
    expect(result.summary).toBe('Mock execution completed');
  });
});
