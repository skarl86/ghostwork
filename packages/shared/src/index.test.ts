import { describe, it, expect } from 'vitest';
import { ok, err } from './index.js';

describe('Result helpers', () => {
  it('ok — returns success result', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(result.data).toBe(42);
    expect(result.error).toBeUndefined();
  });

  it('err — returns error result', () => {
    const result = err(new Error('fail'));
    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('fail');
    expect(result.data).toBeUndefined();
  });
});
