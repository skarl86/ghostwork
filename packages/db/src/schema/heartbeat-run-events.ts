import { pgTable, text, uuid, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { heartbeatRuns } from './heartbeat-runs.js';
import { companies } from './companies.js';

export const heartbeatRunEvents = pgTable('heartbeat_run_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id')
    .notNull()
    .references(() => heartbeatRuns.id),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  kind: text('kind').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }),
});
