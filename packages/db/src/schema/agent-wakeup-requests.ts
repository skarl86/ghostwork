import { pgTable, text, uuid, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';
import { companies } from './companies.js';

export const agentWakeupRequests = pgTable('agent_wakeup_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id),
  reason: text('reason'),
  taskId: text('task_id'),
  contextSnapshot: jsonb('context_snapshot'),
  status: text('status'),
  createdAt: timestamp('created_at', { withTimezone: true }),
});
