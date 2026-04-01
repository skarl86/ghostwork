import { describe, it, expect, vi } from 'vitest';
import type { Db } from '@ghostwork/db';
import { getDefaultCompanyGoal } from '../services/goals.js';

function createMockDb(rows: Record<string, unknown>[][]) {
  let callIndex = 0;
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((fn: (rows: unknown[]) => unknown) => {
      const result = rows[callIndex] ?? [];
      callIndex++;
      return Promise.resolve(fn(result));
    }),
  };
  return chain as unknown as Pick<Db, 'select'>;
}

describe('getDefaultCompanyGoal', () => {
  it('returns active root company goal (first query)', async () => {
    const goal = { id: 'g1', level: 'company', status: 'active', parentId: null };
    const db = createMockDb([[goal]]);
    const result = await getDefaultCompanyGoal(db, 'comp-1');
    expect(result).toEqual(goal);
  });

  it('falls back to any root company goal (second query)', async () => {
    const goal = { id: 'g2', level: 'company', status: 'planned', parentId: null };
    const db = createMockDb([[], [goal]]);
    const result = await getDefaultCompanyGoal(db, 'comp-1');
    expect(result).toEqual(goal);
  });

  it('falls back to any company-level goal (third query)', async () => {
    const goal = { id: 'g3', level: 'company', status: 'planned', parentId: 'parent-1' };
    const db = createMockDb([[], [], [goal]]);
    const result = await getDefaultCompanyGoal(db, 'comp-1');
    expect(result).toEqual(goal);
  });

  it('returns null when no company goals exist', async () => {
    const db = createMockDb([[], [], []]);
    const result = await getDefaultCompanyGoal(db, 'comp-1');
    expect(result).toBeNull();
  });
});
