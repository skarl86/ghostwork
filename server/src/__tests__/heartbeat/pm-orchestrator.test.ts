/**
 * PM Orchestrator unit tests — parsing, extraction, and type guards.
 */

import { describe, it, expect } from 'vitest';
import {
  parsePMResponse,
  parsePMReview,
  extractOutermostJSON,
  isPMPlan,
  isPMReview,
  MAX_REVIEW_CYCLES,
} from '../../heartbeat/pm-orchestrator.js';

// ── parsePMResponse ──

describe('parsePMResponse', () => {
  it('parses valid JSON in markdown code block', () => {
    const input = `Here is my plan:

\`\`\`json
{
  "analysis": "Need to build a login page",
  "subtasks": [
    { "title": "Create auth API", "description": "REST endpoints", "role": "engineer", "priority": "high" }
  ],
  "notes": "Use JWT"
}
\`\`\`

Let me know if you need changes.`;

    const result = parsePMResponse(input);
    expect(result).not.toBeNull();
    expect(result!.analysis).toBe('Need to build a login page');
    expect(result!.subtasks).toHaveLength(1);
    expect(result!.subtasks[0]!.title).toBe('Create auth API');
    expect(result!.notes).toBe('Use JWT');
  });

  it('parses valid raw JSON', () => {
    const input = JSON.stringify({
      analysis: 'Simple task',
      subtasks: [
        { title: 'Do thing', description: 'Details', role: 'engineer', priority: 'medium' },
      ],
    });

    const result = parsePMResponse(input);
    expect(result).not.toBeNull();
    expect(result!.analysis).toBe('Simple task');
    expect(result!.subtasks).toHaveLength(1);
  });

  it('parses mixed text + JSON', () => {
    const input = `I've analyzed the task and here's my plan: {"analysis": "Auth system", "subtasks": [{"title": "Setup DB", "description": "Create tables", "role": "engineer", "priority": "high"}]} That should cover it.`;

    const result = parsePMResponse(input);
    expect(result).not.toBeNull();
    expect(result!.analysis).toBe('Auth system');
  });

  it('returns null for invalid/no JSON', () => {
    expect(parsePMResponse('Just some random text without JSON')).toBeNull();
    expect(parsePMResponse('')).toBeNull();
    expect(parsePMResponse('   ')).toBeNull();
    expect(parsePMResponse('{invalid json}')).toBeNull();
  });

  it('returns null for JSON missing required fields (no subtasks)', () => {
    const input = JSON.stringify({
      analysis: 'Analysis without subtasks',
    });
    expect(parsePMResponse(input)).toBeNull();
  });

  it('returns null for empty subtasks array', () => {
    // isPMPlan requires subtasks.length > 0
    const input = JSON.stringify({
      analysis: 'Empty plan',
      subtasks: [],
    });
    expect(parsePMResponse(input)).toBeNull();
  });
});

// ── parsePMReview ──

describe('parsePMReview', () => {
  it('parses APPROVED decision', () => {
    const input = JSON.stringify({
      review: 'Everything looks good',
      decision: 'APPROVED',
      feedback: 'Great work',
    });

    const result = parsePMReview(input);
    expect(result).not.toBeNull();
    expect(result!.decision).toBe('APPROVED');
    expect(result!.review).toBe('Everything looks good');
    expect(result!.feedback).toBe('Great work');
  });

  it('parses NEEDS_CHANGES with feedback and reopenTitles', () => {
    const input = JSON.stringify({
      review: 'Some issues found',
      decision: 'NEEDS_CHANGES',
      feedback: 'Auth endpoint needs error handling',
      reopen: ['Create auth API', 'Add tests'],
    });

    const result = parsePMReview(input);
    expect(result).not.toBeNull();
    expect(result!.decision).toBe('NEEDS_CHANGES');
    expect(result!.feedback).toBe('Auth endpoint needs error handling');
    expect(result!.reopen).toEqual(['Create auth API', 'Add tests']);
  });

  it('returns null for invalid JSON', () => {
    expect(parsePMReview('not json at all')).toBeNull();
    expect(parsePMReview('')).toBeNull();
    expect(parsePMReview('{broken')).toBeNull();
  });

  it('returns null for missing decision field', () => {
    const input = JSON.stringify({
      review: 'I reviewed it',
      feedback: 'Looks fine',
    });
    expect(parsePMReview(input)).toBeNull();
  });
});

// ── extractOutermostJSON ──

describe('extractOutermostJSON', () => {
  it('extracts simple JSON object', () => {
    const result = extractOutermostJSON('prefix {"key": "value"} suffix');
    expect(result).toBe('{"key": "value"}');
    expect(JSON.parse(result!)).toEqual({ key: 'value' });
  });

  it('extracts nested JSON with strings containing braces', () => {
    const json = '{"outer": "has {braces}", "nested": {"inner": true}}';
    const result = extractOutermostJSON(`text before ${json} text after`);
    expect(result).toBe(json);
    expect(JSON.parse(result!)).toEqual({
      outer: 'has {braces}',
      nested: { inner: true },
    });
  });

  it('returns null when no JSON present', () => {
    expect(extractOutermostJSON('no json here')).toBeNull();
    expect(extractOutermostJSON('')).toBeNull();
    expect(extractOutermostJSON('just [an, array]')).toBeNull();
  });

  it('extracts first JSON object when multiple are present', () => {
    const result = extractOutermostJSON('{"first": 1} {"second": 2}');
    expect(result).toBe('{"first": 1}');
    expect(JSON.parse(result!)).toEqual({ first: 1 });
  });
});

// ── Type Guards ──

describe('isPMPlan', () => {
  it('returns true for valid PMPlan', () => {
    expect(
      isPMPlan({
        analysis: 'test',
        subtasks: [{ title: 'task', role: 'engineer' }],
      }),
    ).toBe(true);
  });

  it('returns false for missing analysis', () => {
    expect(
      isPMPlan({
        subtasks: [{ title: 'task', role: 'engineer' }],
      }),
    ).toBe(false);
  });

  it('returns false for missing subtasks', () => {
    expect(isPMPlan({ analysis: 'test' })).toBe(false);
  });

  it('returns false for empty subtasks', () => {
    expect(isPMPlan({ analysis: 'test', subtasks: [] })).toBe(false);
  });

  it('returns false for subtasks missing title', () => {
    expect(
      isPMPlan({
        analysis: 'test',
        subtasks: [{ role: 'engineer' }],
      }),
    ).toBe(false);
  });

  it('returns false for subtasks missing role', () => {
    expect(
      isPMPlan({
        analysis: 'test',
        subtasks: [{ title: 'task' }],
      }),
    ).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isPMPlan(null)).toBe(false);
    expect(isPMPlan(undefined)).toBe(false);
    expect(isPMPlan('string')).toBe(false);
    expect(isPMPlan(42)).toBe(false);
  });
});

describe('isPMReview', () => {
  it('returns true for APPROVED', () => {
    expect(isPMReview({ review: 'ok', decision: 'APPROVED' })).toBe(true);
  });

  it('returns true for NEEDS_CHANGES', () => {
    expect(isPMReview({ review: 'issues', decision: 'NEEDS_CHANGES' })).toBe(true);
  });

  it('returns false for invalid decision', () => {
    expect(isPMReview({ review: 'ok', decision: 'MAYBE' })).toBe(false);
  });

  it('returns false for missing review field', () => {
    expect(isPMReview({ decision: 'APPROVED' })).toBe(false);
  });

  it('returns false for missing decision field', () => {
    expect(isPMReview({ review: 'ok' })).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isPMReview(null)).toBe(false);
    expect(isPMReview(undefined)).toBe(false);
    expect(isPMReview('string')).toBe(false);
  });
});

// ── Constants ──

describe('MAX_REVIEW_CYCLES', () => {
  it('is set to 3', () => {
    expect(MAX_REVIEW_CYCLES).toBe(3);
  });
});
