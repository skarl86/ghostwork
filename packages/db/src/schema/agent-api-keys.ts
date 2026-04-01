import { pgTable, text, uuid, timestamp, index } from 'drizzle-orm/pg-core';
import { isNull } from 'drizzle-orm';
import { agents } from './agents.js';
import { companies } from './companies.js';

export const agentApiKeys = pgTable(
  'agent_api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    keyHash: text('key_hash').notNull(),
    label: text('label'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('agent_api_keys_key_hash_idx')
      .on(table.keyHash)
      .where(isNull(table.revokedAt)),
  ],
);
