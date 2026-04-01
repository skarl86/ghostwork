import { pgTable, text, uuid, timestamp } from 'drizzle-orm/pg-core';
import { companies } from './companies.js';
import { goals } from './goals.js';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').default('active'),
  goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
