import { pgTable, text, uuid, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { companies } from './companies.js';

export const budgetPolicies = pgTable('budget_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  scopeType: text('scope_type').notNull(),
  scopeId: uuid('scope_id'),
  metric: text('metric').notNull(),
  windowKind: text('window_kind').notNull(),
  amount: integer('amount').notNull(),
  warnPercent: integer('warn_percent').default(80),
  hardStopEnabled: boolean('hard_stop_enabled').default(false),
  notifyEnabled: boolean('notify_enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});
