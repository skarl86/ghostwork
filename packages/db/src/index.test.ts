import { describe, it, expect } from 'vitest';
import * as schema from './schema/index.js';

describe('@ghostwork/db schema exports', () => {
  it('exports all 25 tables', () => {
    const tables = [
      schema.companies,
      schema.agents,
      schema.agentRuntimeState,
      schema.agentApiKeys,
      schema.agentConfigRevisions,
      schema.agentTaskSessions,
      schema.agentWakeupRequests,
      schema.projects,
      schema.projectWorkspaces,
      schema.executionWorkspaces,
      schema.issues,
      schema.goals,
      schema.heartbeatRuns,
      schema.heartbeatRunEvents,
      schema.budgetPolicies,
      schema.approvals,
      schema.approvalComments,
      schema.routines,
      schema.routineTriggers,
      schema.routineRuns,
      schema.companyMemberships,
      schema.instanceUserRoles,
      schema.principalPermissionGrants,
      schema.companySecrets,
      schema.companySecretVersions,
      schema.activityLog,
    ];

    // 26 table objects (approvalComments is separate from approvals)
    expect(tables).toHaveLength(26);
    for (const table of tables) {
      expect(table).toBeDefined();
    }
  });

  it('exports createDb function', async () => {
    const { createDb } = await import('./client.js');
    expect(typeof createDb).toBe('function');
  });
});
