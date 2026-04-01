import { describe, it, expect } from 'vitest';
import { queryKeys } from '../hooks/queries';

describe('queryKeys factory', () => {
  it('companies returns static key', () => {
    expect(queryKeys.companies).toEqual(['companies']);
  });

  it('company(id) includes the id', () => {
    expect(queryKeys.company('abc-123')).toEqual(['companies', 'abc-123']);
  });

  it('agents(companyId) scopes by company', () => {
    expect(queryKeys.agents('co-1')).toEqual(['agents', 'co-1']);
  });

  it('agent(id) nests under detail', () => {
    expect(queryKeys.agent('ag-1')).toEqual(['agents', 'detail', 'ag-1']);
  });

  it('issues with no filters uses empty object', () => {
    expect(queryKeys.issues('co-1')).toEqual(['issues', 'co-1', {}]);
  });

  it('issues with filters includes them', () => {
    const filters = { status: 'open', priority: 'high' };
    expect(queryKeys.issues('co-1', filters)).toEqual(['issues', 'co-1', filters]);
  });

  it('issue(id) nests under detail', () => {
    expect(queryKeys.issue('iss-1')).toEqual(['issues', 'detail', 'iss-1']);
  });

  it('runs includes optional agentId', () => {
    expect(queryKeys.runs('co-1')).toEqual(['runs', 'co-1', undefined]);
    expect(queryKeys.runs('co-1', 'ag-1')).toEqual(['runs', 'co-1', 'ag-1']);
  });

  it('runEvents scopes by runId', () => {
    expect(queryKeys.runEvents('run-1')).toEqual(['runEvents', 'run-1']);
  });

  it('activity scopes by companyId', () => {
    expect(queryKeys.activity('co-1')).toEqual(['activity', 'co-1']);
  });
});
