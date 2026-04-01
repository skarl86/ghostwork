import { pgTable, text, uuid, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';
import { companies } from './companies.js';

export const agentRuntimeState = pgTable('agent_runtime_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .unique()
    .references(() => agents.id),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  sessionId: text('session_id'),
  sessionParams: jsonb('session_params'),
  lastError: text('last_error'),
  lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
});
