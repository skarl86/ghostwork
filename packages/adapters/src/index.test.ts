import { describe, it, expect } from 'vitest';
import type { ServerAdapterModule, AdapterExecutionResult } from './index.js';

describe('Adapter interfaces', () => {
  it('ServerAdapterModule — type satisfies interface', () => {
    const mockAdapter: ServerAdapterModule = {
      type: 'mock',
      async execute(): Promise<AdapterExecutionResult> {
        return {
          exitCode: 0,
          signal: null,
          timedOut: false,
          costUsd: null,
          summary: 'done',
        };
      },
      async testEnvironment() {
        return { success: true };
      },
    };

    expect(mockAdapter.type).toBe('mock');
  });
});
