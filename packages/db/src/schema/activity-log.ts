import { pgTable, text, uuid, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { desc } from 'drizzle-orm';
import { companies } from './companies.js';

export const activityLog = pgTable(
  'activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    actorType: text('actor_type'),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }),
  },
  (table) => [
    index('activity_log_company_entity_idx').on(
      table.companyId,
      table.entityType,
      table.entityId,
    ),
    index('activity_log_company_created_idx').on(table.companyId, desc(table.createdAt)),
  ],
);
