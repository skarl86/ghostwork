import { pgTable, text, uuid, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { companies } from './companies.js';
import { agents } from './agents.js';

export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  type: text('type').notNull(),
  status: text('status').notNull(),
  requestedByAgentId: uuid('requested_by_agent_id').references(() => agents.id),
  requestedByUserId: text('requested_by_user_id'),
  decidedByUserId: text('decided_by_user_id'),
  decisionNote: text('decision_note'),
  payload: jsonb('payload'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }),
});

export const approvalComments = pgTable('approval_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  approvalId: uuid('approval_id')
    .notNull()
    .references(() => approvals.id),
  body: text('body').notNull(),
  authorUserId: text('author_user_id'),
  authorAgentId: uuid('author_agent_id').references(() => agents.id),
  createdAt: timestamp('created_at', { withTimezone: true }),
});
