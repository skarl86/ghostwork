import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getConnectionUrl } from '../../embedded.js';
import { createDb, type Db } from '../../client.js';
import { applyPendingMigrations } from '../../migrate.js';
import {
  companies,
  agents,
  issues,
  goals,
  heartbeatRuns,
  heartbeatRunEvents,
  agentRuntimeState as _agentRuntimeState,
  projects as _projects,
  projectWorkspaces as _projectWorkspaces,
  activityLog as _activityLog,
} from '../../schema/index.js';
import type { EmbeddedPgResult } from '../../embedded.js';
import type postgres from 'postgres';

let embedded: EmbeddedPgResult;
let db: Db;
let client: postgres.Sql;

beforeAll(async () => {
  embedded = await getConnectionUrl();
  const conn = createDb(embedded.url);
  db = conn.db;
  client = conn.client;
  await applyPendingMigrations(db);
}, 60_000);

afterAll(async () => {
  await client.end();
  await embedded.stop();
}, 30_000);

describe('Companies CRUD', () => {
  it('creates and reads a company', async () => {
    const [created] = await db
      .insert(companies)
      .values({ name: 'Test Corp' })
      .returning();

    expect(created).toBeDefined();
    expect(created!.name).toBe('Test Corp');
    expect(created!.status).toBe('active');
    expect(created!.id).toBeDefined();

    const [found] = await db.select().from(companies).where(eq(companies.id, created!.id));
    expect(found).toBeDefined();
    expect(found!.name).toBe('Test Corp');

    // Cleanup
    await db.delete(companies).where(eq(companies.id, created!.id));
  });

  it('applies default values correctly', async () => {
    const [c] = await db
      .insert(companies)
      .values({ name: 'Defaults Test' })
      .returning();

    expect(c!.status).toBe('active');
    expect(c!.issueCounter).toBe(0);
    expect(c!.spentMonthlyCents).toBe(0);
    expect(c!.requireBoardApprovalForNewAgents).toBe(false);
    expect(c!.createdAt).toBeInstanceOf(Date);
    expect(c!.updatedAt).toBeInstanceOf(Date);

    await db.delete(companies).where(eq(companies.id, c!.id));
  });
});

describe('Agents CRUD', () => {
  it('creates agent with FK to company', async () => {
    const [company] = await db.insert(companies).values({ name: 'Agent Co' }).returning();
    const [agent] = await db
      .insert(agents)
      .values({
        companyId: company!.id,
        name: 'Kent',
        adapterType: 'claude_local',
      })
      .returning();

    expect(agent!.name).toBe('Kent');
    expect(agent!.role).toBe('general');
    expect(agent!.status).toBe('idle');
    expect(agent!.companyId).toBe(company!.id);

    // Cleanup
    await db.delete(agents).where(eq(agents.id, agent!.id));
    await db.delete(companies).where(eq(companies.id, company!.id));
  });

  it('rejects agent without valid companyId', async () => {
    const bogusId = '00000000-0000-0000-0000-000000000000';
    await expect(
      db.insert(agents).values({
        companyId: bogusId,
        name: 'Bad Agent',
        adapterType: 'process',
      }),
    ).rejects.toThrow();
  });
});

describe('Issues CRUD & self-referencing FK', () => {
  it('creates issue with parent (self-ref)', async () => {
    const [company] = await db.insert(companies).values({ name: 'Issue Co' }).returning();

    const [parent] = await db
      .insert(issues)
      .values({
        companyId: company!.id,
        title: 'Parent Issue',
      })
      .returning();

    const [child] = await db
      .insert(issues)
      .values({
        companyId: company!.id,
        title: 'Child Issue',
        parentId: parent!.id,
      })
      .returning();

    expect(child!.parentId).toBe(parent!.id);
    expect(child!.status).toBe('backlog');
    expect(child!.priority).toBe('medium');
    expect(child!.originKind).toBe('manual');
    expect(child!.requestDepth).toBe(0);

    // Cleanup
    await db.delete(issues).where(eq(issues.id, child!.id));
    await db.delete(issues).where(eq(issues.id, parent!.id));
    await db.delete(companies).where(eq(companies.id, company!.id));
  });
});

describe('Goals self-referencing FK', () => {
  it('creates hierarchical goals', async () => {
    const [company] = await db.insert(companies).values({ name: 'Goal Co' }).returning();

    const [strategic] = await db
      .insert(goals)
      .values({
        companyId: company!.id,
        title: 'Strategic Goal',
        level: 'strategic',
      })
      .returning();

    const [project] = await db
      .insert(goals)
      .values({
        companyId: company!.id,
        title: 'Project Goal',
        level: 'project',
        parentId: strategic!.id,
      })
      .returning();

    expect(project!.parentId).toBe(strategic!.id);
    expect(project!.status).toBe('planned');

    // Cleanup
    await db.delete(goals).where(eq(goals.id, project!.id));
    await db.delete(goals).where(eq(goals.id, strategic!.id));
    await db.delete(companies).where(eq(companies.id, company!.id));
  });
});

describe('Heartbeat Runs', () => {
  it('creates a run with events', async () => {
    const [company] = await db.insert(companies).values({ name: 'Run Co' }).returning();
    const [agent] = await db
      .insert(agents)
      .values({ companyId: company!.id, name: 'Runner', adapterType: 'process' })
      .returning();

    const [run] = await db
      .insert(heartbeatRuns)
      .values({
        companyId: company!.id,
        agentId: agent!.id,
        status: 'queued',
      })
      .returning();

    const [event] = await db
      .insert(heartbeatRunEvents)
      .values({
        runId: run!.id,
        companyId: company!.id,
        kind: 'started',
      })
      .returning();

    expect(event!.runId).toBe(run!.id);
    expect(event!.kind).toBe('started');

    // Cleanup
    await db.delete(heartbeatRunEvents).where(eq(heartbeatRunEvents.id, event!.id));
    await db.delete(heartbeatRuns).where(eq(heartbeatRuns.id, run!.id));
    await db.delete(agents).where(eq(agents.id, agent!.id));
    await db.delete(companies).where(eq(companies.id, company!.id));
  });
});

describe('SET NULL onDelete behavior', () => {
  it('sets checkoutRunId to NULL when run is deleted', async () => {
    const [company] = await db.insert(companies).values({ name: 'SetNull Co' }).returning();
    const [agent] = await db
      .insert(agents)
      .values({ companyId: company!.id, name: 'SN Agent', adapterType: 'process' })
      .returning();
    const [run] = await db
      .insert(heartbeatRuns)
      .values({ companyId: company!.id, agentId: agent!.id, status: 'running' })
      .returning();

    const [issue] = await db
      .insert(issues)
      .values({
        companyId: company!.id,
        title: 'SetNull Test',
        checkoutRunId: run!.id,
      })
      .returning();

    expect(issue!.checkoutRunId).toBe(run!.id);

    // Delete the run — issue.checkoutRunId should become NULL
    await db.delete(heartbeatRuns).where(eq(heartbeatRuns.id, run!.id));

    const [updated] = await db.select().from(issues).where(eq(issues.id, issue!.id));
    expect(updated!.checkoutRunId).toBeNull();

    // Cleanup
    await db.delete(issues).where(eq(issues.id, issue!.id));
    await db.delete(agents).where(eq(agents.id, agent!.id));
    await db.delete(companies).where(eq(companies.id, company!.id));
  });
});

describe('Indexes', () => {
  it('has all required indexes', async () => {
    const result = await db.execute<{ indexname: string }>(
      sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`,
    );

    const indexNames = result.map((r) => r.indexname);

    // Issue indexes
    expect(indexNames).toContain('issues_company_status_idx');
    expect(indexNames).toContain('issues_company_assignee_status_idx');
    expect(indexNames).toContain('issues_company_assignee_user_status_idx');

    // Heartbeat run indexes
    expect(indexNames).toContain('heartbeat_runs_company_agent_status_idx');
    expect(indexNames).toContain('heartbeat_runs_company_status_created_idx');

    // Agent API keys partial index
    expect(indexNames).toContain('agent_api_keys_key_hash_idx');

    // Activity log indexes
    expect(indexNames).toContain('activity_log_company_entity_idx');
    expect(indexNames).toContain('activity_log_company_created_idx');
  });
});

describe('Table count verification', () => {
  it('has all 25 tables', async () => {
    const result = await db.execute<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
    );

    const tableNames = result.map((r) => r.table_name);

    const expectedTables = [
      'activity_log',
      'agent_api_keys',
      'agent_config_revisions',
      'agent_runtime_state',
      'agent_task_sessions',
      'agent_wakeup_requests',
      'agents',
      'approval_comments',
      'approvals',
      'budget_policies',
      'companies',
      'company_memberships',
      'company_secret_versions',
      'company_secrets',
      'execution_workspaces',
      'goals',
      'heartbeat_run_events',
      'heartbeat_runs',
      'instance_user_roles',
      'issues',
      'principal_permission_grants',
      'project_workspaces',
      'projects',
      'routine_runs',
      'routine_triggers',
      'routines',
    ];

    for (const table of expectedTables) {
      expect(tableNames).toContain(table);
    }
    // 25 in spec, but we have approval_comments separate from approvals, so 26 actual tables
    // The spec lists "approvals, approval_comments" as one line — let's verify we have >= 25
    expect(tableNames.length).toBeGreaterThanOrEqual(25);
  });
});
