import { type AnyPgColumn, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies.js';
import { issues } from './issues.js';
import { projectWorkspaces } from './project-workspaces.js';
import { projects } from './projects.js';

export const executionWorkspaces = pgTable(
  'execution_workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    projectId: uuid('project_id').references(() => projects.id),
    projectWorkspaceId: uuid('project_workspace_id').references(() => projectWorkspaces.id, {
      onDelete: 'set null',
    }),
    sourceIssueId: uuid('source_issue_id').references((): AnyPgColumn => issues.id, {
      onDelete: 'set null',
    }),
    mode: text('mode').notNull().default('issue'),
    strategyType: text('strategy_type').notNull().default('branch'),
    name: text('name'),
    label: text('label'),
    status: text('status').notNull().default('active'),
    cwd: text('cwd'),
    repoUrl: text('repo_url'),
    baseRef: text('base_ref'),
    branchName: text('branch_name'),
    providerType: text('provider_type').notNull().default('local_fs'),
    providerRef: text('provider_ref'),
    derivedFromExecutionWorkspaceId: uuid('derived_from_execution_workspace_id').references(
      (): AnyPgColumn => executionWorkspaces.id,
      { onDelete: 'set null' },
    ),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('execution_workspaces_company_project_status_idx').on(
      table.companyId,
      table.projectId,
      table.status,
    ),
    index('execution_workspaces_company_source_issue_idx').on(
      table.companyId,
      table.sourceIssueId,
    ),
    index('execution_workspaces_company_branch_idx').on(
      table.companyId,
      table.branchName,
    ),
  ],
);
