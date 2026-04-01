import { pgTable, text, uuid, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';
import { companies } from './companies.js';

export const agentConfigRevisions = pgTable('agent_config_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agents.id),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  revision: integer('revision').notNull(),
  config: jsonb('config').notNull(),
  changedBy: text('changed_by'),
  createdAt: timestamp('created_at', { withTimezone: true }),
});
