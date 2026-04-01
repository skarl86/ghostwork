import { pgTable, text, uuid, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { companies } from './companies.js';
import { projects } from './projects.js';
import { goals } from './goals.js';

export const routines = pgTable('routines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  projectId: uuid('project_id').references(() => projects.id),
  goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const routineTriggers = pgTable('routine_triggers', {
  id: uuid('id').primaryKey().defaultRandom(),
  routineId: uuid('routine_id')
    .notNull()
    .references(() => routines.id),
  triggerType: text('trigger_type').notNull(),
  config: jsonb('config').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }),
});

export const routineRuns = pgTable('routine_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  routineId: uuid('routine_id')
    .notNull()
    .references(() => routines.id),
  status: text('status'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }),
});
