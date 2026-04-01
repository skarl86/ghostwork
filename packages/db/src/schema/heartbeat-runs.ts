import { pgTable, text, uuid, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { desc } from 'drizzle-orm';
import { companies } from './companies.js';
import { agents } from './agents.js';

export const heartbeatRuns = pgTable(
  'heartbeat_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id),
    status: text('status').notNull(),
    taskScope: text('task_scope'),
    taskId: text('task_id'),
    contextSnapshot: jsonb('context_snapshot'),
    exitCode: integer('exit_code'),
    signal: text('signal'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }),
    pid: integer('pid'),
    usage: jsonb('usage'),
    costUsd: text('cost_usd'),
    provider: text('provider'),
    biller: text('biller'),
    model: text('model'),
    billingType: text('billing_type'),
    summary: text('summary'),
    sessionId: text('session_id'),
    sessionParams: jsonb('session_params'),
  },
  (table) => [
    index('heartbeat_runs_company_agent_status_idx').on(
      table.companyId,
      table.agentId,
      table.status,
    ),
    index('heartbeat_runs_company_status_created_idx').on(
      table.companyId,
      table.status,
      desc(table.createdAt),
    ),
  ],
);
