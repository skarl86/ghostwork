/**
 * Context snapshot unit tests.
 */

import { describe, it, expect } from 'vitest';
import { buildContextSnapshot } from '../../heartbeat/context.js';

describe('buildContextSnapshot', () => {
  it('includes required fields', () => {
    const env = buildContextSnapshot({
      agentId: 'agent-1',
      companyId: 'company-1',
      apiUrl: 'http://localhost:3100',
      runId: 'run-1',
    });

    expect(env['GHOSTWORK_AGENT_ID']).toBe('agent-1');
    expect(env['GHOSTWORK_COMPANY_ID']).toBe('company-1');
    expect(env['GHOSTWORK_API_URL']).toBe('http://localhost:3100');
    expect(env['GHOSTWORK_RUN_ID']).toBe('run-1');
  });

  it('includes optional fields when provided', () => {
    const env = buildContextSnapshot({
      agentId: 'agent-1',
      companyId: 'company-1',
      apiUrl: 'http://localhost:3100',
      runId: 'run-1',
      taskId: 'task-42',
      wakeReason: 'timer',
      apiKey: 'jwt-token-here',
      approvalId: 'approval-1',
      approvalStatus: 'approved',
      linkedIssueIds: ['issue-1', 'issue-2'],
    });

    expect(env['GHOSTWORK_TASK_ID']).toBe('task-42');
    expect(env['GHOSTWORK_WAKE_REASON']).toBe('timer');
    expect(env['GHOSTWORK_API_KEY']).toBe('jwt-token-here');
    expect(env['GHOSTWORK_APPROVAL_ID']).toBe('approval-1');
    expect(env['GHOSTWORK_APPROVAL_STATUS']).toBe('approved');
    expect(env['GHOSTWORK_LINKED_ISSUE_IDS']).toBe('issue-1,issue-2');
  });

  it('omits optional fields when null/undefined', () => {
    const env = buildContextSnapshot({
      agentId: 'agent-1',
      companyId: 'company-1',
      apiUrl: 'http://localhost:3100',
      runId: 'run-1',
      taskId: null,
      wakeReason: null,
    });

    expect(env).not.toHaveProperty('GHOSTWORK_TASK_ID');
    expect(env).not.toHaveProperty('GHOSTWORK_WAKE_REASON');
    expect(env).not.toHaveProperty('GHOSTWORK_API_KEY');
    expect(env).not.toHaveProperty('GHOSTWORK_LINKED_ISSUE_IDS');
  });

  it('omits linked issue IDs when array is empty', () => {
    const env = buildContextSnapshot({
      agentId: 'agent-1',
      companyId: 'company-1',
      apiUrl: 'http://localhost:3100',
      runId: 'run-1',
      linkedIssueIds: [],
    });

    expect(env).not.toHaveProperty('GHOSTWORK_LINKED_ISSUE_IDS');
  });
});
