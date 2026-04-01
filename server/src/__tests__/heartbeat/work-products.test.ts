/**
 * Work product integration tests — PR URL parsing, branch extraction,
 * developer rework prompt with PR info, and QA state transitions.
 */

import { describe, it, expect } from 'vitest';
import { parsePRUrls, parseBranchName, buildDeveloperPrompt } from '../../heartbeat/execute.js';

// ── parsePRUrls ──

describe('parsePRUrls', () => {
  it('extracts a single GitHub PR URL', () => {
    const summary = 'Created PR at https://github.com/acme/repo/pull/42 for the fix.';
    const result = parsePRUrls(summary);
    expect(result).toEqual([
      { url: 'https://github.com/acme/repo/pull/42', provider: 'github', externalId: '42' },
    ]);
  });

  it('extracts multiple PR URLs from one summary', () => {
    const summary = `
      Main PR: https://github.com/acme/repo/pull/10
      Follow-up: https://github.com/acme/other-repo/pull/99
    `;
    const result = parsePRUrls(summary);
    expect(result).toHaveLength(2);
    expect(result[0]!.externalId).toBe('10');
    expect(result[1]!.externalId).toBe('99');
  });

  it('returns empty array when no PR URL present', () => {
    expect(parsePRUrls('Completed the task successfully.')).toEqual([]);
  });

  it('handles URLs with dashes and dots in org/repo names', () => {
    const summary = 'https://github.com/my-org/my.repo/pull/123';
    const result = parsePRUrls(summary);
    expect(result).toEqual([
      { url: 'https://github.com/my-org/my.repo/pull/123', provider: 'github', externalId: '123' },
    ]);
  });

  it('does not match non-PR GitHub URLs', () => {
    expect(parsePRUrls('See https://github.com/acme/repo/issues/5')).toEqual([]);
  });

  it('handles empty string', () => {
    expect(parsePRUrls('')).toEqual([]);
  });
});

// ── parseBranchName ──

describe('parseBranchName', () => {
  it('extracts branch from "branch: feature/x" format', () => {
    expect(parseBranchName('Pushed to branch: feature/auth-fix')).toBe('feature/auth-fix');
  });

  it('extracts branch from "on branch `x`" format', () => {
    expect(parseBranchName('Working on branch `fix/login-bug`')).toBe('fix/login-bug');
  });

  it('extracts branch from "pushed to x" format', () => {
    expect(parseBranchName('pushed to feature/new-api')).toBe('feature/new-api');
  });

  it('returns null when no branch found', () => {
    expect(parseBranchName('Completed the task.')).toBeNull();
  });

  it('handles branch names with dots and underscores', () => {
    expect(parseBranchName('branch: release/v1.2.3_hotfix')).toBe('release/v1.2.3_hotfix');
  });
});

// ── buildDeveloperPrompt with work product info ──

describe('buildDeveloperPrompt', () => {
  const issue = { title: 'Fix login bug', description: 'Users cannot log in' };

  it('builds basic prompt without feedback', () => {
    const prompt = buildDeveloperPrompt(issue, null);
    expect(prompt).toContain('Task: Fix login bug');
    expect(prompt).toContain('Users cannot log in');
    expect(prompt).toContain('Please complete this task.');
    expect(prompt).not.toContain('QA feedback');
  });

  it('includes QA feedback when present', () => {
    const prompt = buildDeveloperPrompt(issue, 'Tests are missing');
    expect(prompt).toContain('Previous QA feedback: Tests are missing');
    expect(prompt).toContain('Please address the feedback');
  });

  it('includes PR URL and branch info in rework prompt', () => {
    const wpInfo = { prUrl: 'https://github.com/acme/repo/pull/42', branchName: 'fix/login' };
    const prompt = buildDeveloperPrompt(issue, 'Tests are missing', wpInfo);
    expect(prompt).toContain('Existing PR: https://github.com/acme/repo/pull/42');
    expect(prompt).toContain('Branch: fix/login');
    expect(prompt).toContain('Do NOT create a new PR');
    expect(prompt).toContain('existing branch');
  });

  it('includes PR URL without branch name', () => {
    const wpInfo = { prUrl: 'https://github.com/acme/repo/pull/42', branchName: null };
    const prompt = buildDeveloperPrompt(issue, 'Needs fixes', wpInfo);
    expect(prompt).toContain('Existing PR: https://github.com/acme/repo/pull/42');
    expect(prompt).not.toContain('Branch:');
    expect(prompt).toContain('Do NOT create a new PR');
  });

  it('does not include work product info when no QA feedback', () => {
    const wpInfo = { prUrl: 'https://github.com/acme/repo/pull/42', branchName: 'fix/login' };
    // wpInfo is only passed when qaFeedback is present in the execute flow
    const prompt = buildDeveloperPrompt(issue, null, wpInfo);
    expect(prompt).not.toContain('Existing PR');
    expect(prompt).toContain('Please complete this task.');
  });

  it('handles null work product info with QA feedback', () => {
    const prompt = buildDeveloperPrompt(issue, 'Fix the bug', null);
    expect(prompt).toContain('Previous QA feedback: Fix the bug');
    expect(prompt).not.toContain('Existing PR');
    expect(prompt).toContain('Please address the feedback');
  });
});

// ── QA verdict → work_product state transition (documented behavior) ──

describe('QA verdict → work_product state transitions', () => {
  type ReviewState = 'none' | 'approved' | 'changes_requested';

  function nextReviewState(qaVerdict: 'approved' | 'rejected'): ReviewState {
    return qaVerdict === 'approved' ? 'approved' : 'changes_requested';
  }

  it('QA approved → review_state becomes approved', () => {
    expect(nextReviewState('approved')).toBe('approved');
  });

  it('QA rejected → review_state becomes changes_requested', () => {
    expect(nextReviewState('rejected')).toBe('changes_requested');
  });
});
