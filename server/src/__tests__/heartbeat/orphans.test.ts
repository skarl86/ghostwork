/**
 * Orphan detection unit tests — isPidAlive.
 */

import { describe, it, expect, vi } from 'vitest';
import { isPidAlive } from '../../heartbeat/orphans.js';

describe('isPidAlive', () => {
  it('returns true when process.kill(pid, 0) succeeds', () => {
    vi.spyOn(process, 'kill').mockReturnValue(true);
    expect(isPidAlive(12345)).toBe(true);
    vi.restoreAllMocks();
  });

  it('returns false when process.kill(pid, 0) throws', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });
    expect(isPidAlive(99999)).toBe(false);
    vi.restoreAllMocks();
  });
});
