import { pgTable, text, uuid, timestamp, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { companies } from './companies.js';
import { agents } from './agents.js';

export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  title: text('title').notNull(),
  description: text('description'),
  level: text('level').notNull(),
  status: text('status').notNull().default('planned'),
  parentId: uuid('parent_id').references((): AnyPgColumn => goals.id),
  ownerAgentId: uuid('owner_agent_id').references(() => agents.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
