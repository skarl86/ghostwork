import { pgTable, uuid, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { companies } from './companies.js';
import { projects } from './projects.js';
import { goals } from './goals.js';

export const projectGoals = pgTable(
  'project_goals',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.goalId] })],
);
