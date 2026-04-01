/**
 * Smoke test for CLI exports.
 */

import { describe, it, expect } from 'vitest';
import { CLI_VERSION, createProgram, createApiClient, loadCliConfig } from './index.js';

describe('@ghostwork/cli', () => {
  it('should export CLI_VERSION', () => {
    expect(CLI_VERSION).toBe('0.1.0');
  });

  it('should export createProgram', () => {
    expect(typeof createProgram).toBe('function');
  });

  it('should export createApiClient', () => {
    expect(typeof createApiClient).toBe('function');
  });

  it('should export loadCliConfig', () => {
    expect(typeof loadCliConfig).toBe('function');
  });
});
