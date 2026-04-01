import { pgTable, text, uuid, timestamp } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';
import { companies } from './companies.js';

export const projectWorkspaces = pgTable('project_workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  cwd: text('cwd'),
  repoUrl: text('repo_url'),
  branch: text('branch'),
  createdAt: timestamp('created_at', { withTimezone: true }),
});
