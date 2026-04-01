import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies.js';
import { projects } from './projects.js';

export const executionWorkspaces = pgTable('execution_workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  projectId: uuid('project_id').references(() => projects.id),
  label: text('label'),
  cwd: text('cwd'),
  repoUrl: text('repo_url'),
  status: text('status'),
});
