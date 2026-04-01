import { describe, it, expect } from 'vitest';
import { resolveIssueGoalId, resolveNextIssueGoalId } from '../services/issue-goal-fallback.js';

describe('resolveIssueGoalId', () => {
  it('returns explicit goalId when provided', () => {
    expect(
      resolveIssueGoalId({
        projectId: 'proj-1',
        goalId: 'goal-explicit',
        projectGoalId: 'goal-project',
        defaultGoalId: 'goal-default',
      }),
    ).toBe('goal-explicit');
  });

  it('returns projectGoalId when projectId is set but no goalId', () => {
    expect(
      resolveIssueGoalId({
        projectId: 'proj-1',
        goalId: null,
        projectGoalId: 'goal-project',
        defaultGoalId: 'goal-default',
      }),
    ).toBe('goal-project');
  });

  it('returns null when projectId is set but project has no goal', () => {
    expect(
      resolveIssueGoalId({
        projectId: 'proj-1',
        goalId: null,
        projectGoalId: null,
        defaultGoalId: 'goal-default',
      }),
    ).toBeNull();
  });

  it('returns defaultGoalId when no projectId and no goalId', () => {
    expect(
      resolveIssueGoalId({
        projectId: null,
        goalId: null,
        defaultGoalId: 'goal-default',
      }),
    ).toBe('goal-default');
  });

  it('returns null when nothing is available', () => {
    expect(
      resolveIssueGoalId({
        projectId: null,
        goalId: null,
        defaultGoalId: null,
      }),
    ).toBeNull();
  });
});

describe('resolveNextIssueGoalId', () => {
  const base = {
    currentProjectId: 'proj-old',
    currentGoalId: null as string | null,
    currentProjectGoalId: 'goal-old-proj',
    defaultGoalId: 'goal-default',
  };

  it('returns explicit goalId when provided in update', () => {
    expect(
      resolveNextIssueGoalId({
        ...base,
        goalId: 'goal-explicit',
        projectId: undefined,
      }),
    ).toBe('goal-explicit');
  });

  it('falls back to new project goal when goalId is cleared (set to null)', () => {
    expect(
      resolveNextIssueGoalId({
        ...base,
        goalId: null,
        projectId: 'proj-new',
        projectGoalId: 'goal-new-proj',
      }),
    ).toBe('goal-new-proj');
  });

  it('returns next fallback when projectId changes and current goal was auto-assigned', () => {
    expect(
      resolveNextIssueGoalId({
        ...base,
        currentGoalId: 'goal-old-proj', // matches current fallback
        projectId: 'proj-new',
        projectGoalId: 'goal-new-proj',
      }),
    ).toBe('goal-new-proj');
  });

  it('keeps manually-set goalId when projectId changes', () => {
    expect(
      resolveNextIssueGoalId({
        ...base,
        currentGoalId: 'goal-manual', // does NOT match current fallback
        projectId: 'proj-new',
        projectGoalId: 'goal-new-proj',
      }),
    ).toBe('goal-manual');
  });

  it('returns default when no project and no explicit goal', () => {
    expect(
      resolveNextIssueGoalId({
        currentProjectId: null,
        currentGoalId: null,
        defaultGoalId: 'goal-default',
      }),
    ).toBe('goal-default');
  });
});
