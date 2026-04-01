import { pgTable, text, uuid, timestamp, integer, jsonb, index, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { companies } from './companies.js';
import { projects } from './projects.js';
import { projectWorkspaces } from './project-workspaces.js';
import { executionWorkspaces } from './execution-workspaces.js';
import { goals } from './goals.js';
import { agents } from './agents.js';
import { heartbeatRuns } from './heartbeat-runs.js';

export const issues = pgTable(
  'issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    projectId: uuid('project_id').references(() => projects.id),
    projectWorkspaceId: uuid('project_workspace_id').references(() => projectWorkspaces.id, {
      onDelete: 'set null',
    }),
    goalId: uuid('goal_id').references(() => goals.id),
    parentId: uuid('parent_id').references((): AnyPgColumn => issues.id),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('backlog'),
    priority: text('priority').notNull().default('medium'),
    assigneeAgentId: uuid('assignee_agent_id').references(() => agents.id),
    assigneeUserId: text('assignee_user_id'),
    checkoutRunId: uuid('checkout_run_id').references(() => heartbeatRuns.id, {
      onDelete: 'set null',
    }),
    executionRunId: uuid('execution_run_id').references(() => heartbeatRuns.id, {
      onDelete: 'set null',
    }),
    executionAgentNameKey: text('execution_agent_name_key'),
    executionLockedAt: timestamp('execution_locked_at', { withTimezone: true }),
    createdByAgentId: uuid('created_by_agent_id').references(() => agents.id),
    createdByUserId: text('created_by_user_id'),
    issueNumber: integer('issue_number'),
    identifier: text('identifier'),
    originKind: text('origin_kind').notNull().default('manual'),
    originId: text('origin_id'),
    originRunId: text('origin_run_id'),
    requestDepth: integer('request_depth').notNull().default(0),
    billingCode: text('billing_code'),
    assigneeAdapterOverrides: jsonb('assignee_adapter_overrides'),
    executionWorkspaceId: uuid('execution_workspace_id').references(() => executionWorkspaces.id, {
      onDelete: 'set null',
    }),
    executionWorkspacePreference: text('execution_workspace_preference'),
    executionWorkspaceSettings: jsonb('execution_workspace_settings'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('issues_company_status_idx').on(table.companyId, table.status),
    index('issues_company_assignee_status_idx').on(
      table.companyId,
      table.assigneeAgentId,
      table.status,
    ),
    index('issues_company_assignee_user_status_idx').on(
      table.companyId,
      table.assigneeUserId,
      table.status,
    ),
  ],
);
