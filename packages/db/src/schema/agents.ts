import { pgTable, text, uuid, timestamp, integer, jsonb, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { companies } from './companies.js';

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  name: text('name').notNull(),
  role: text('role').notNull().default('general'),
  title: text('title'),
  icon: text('icon'),
  status: text('status').notNull().default('idle'),
  reportsTo: uuid('reports_to').references((): AnyPgColumn => agents.id),
  adapterType: text('adapter_type').notNull(),
  adapterConfig: jsonb('adapter_config'),
  runtimeConfig: jsonb('runtime_config'),
  budgetMonthlyCents: integer('budget_monthly_cents'),
  spentMonthlyCents: integer('spent_monthly_cents').default(0),
  permissions: jsonb('permissions'),
  capabilities: text('capabilities'),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
