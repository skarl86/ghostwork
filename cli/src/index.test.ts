import { describe, it, expect } from 'vitest';
import { CLI_VERSION } from './index.js';

describe('CLI placeholder', () => {
  it('exports version', () => {
    expect(CLI_VERSION).toBe('0.0.1');
  });
});
