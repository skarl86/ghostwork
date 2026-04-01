import { pgTable, text, uuid, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  issuePrefix: text('issue_prefix'),
  issueCounter: integer('issue_counter').default(0),
  budgetMonthlyCents: integer('budget_monthly_cents'),
  spentMonthlyCents: integer('spent_monthly_cents').default(0),
  requireBoardApprovalForNewAgents: boolean('require_board_approval_for_new_agents').default(false),
  brandColor: text('brand_color'),
  pauseReason: text('pause_reason'),
  pausedAt: timestamp('paused_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
