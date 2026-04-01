import { pgTable, text, uuid, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';
import { companies } from './companies.js';

export const agentTaskSessions = pgTable('agent_task_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  taskKey: text('task_key').notNull(),
  sessionId: text('session_id'),
  sessionParams: jsonb('session_params'),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});
