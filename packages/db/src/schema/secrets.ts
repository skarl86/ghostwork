import { pgTable, text, uuid, timestamp, integer } from 'drizzle-orm/pg-core';
import { companies } from './companies.js';

export const companySecrets = pgTable('company_secrets', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const companySecretVersions = pgTable('company_secret_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  secretId: uuid('secret_id')
    .notNull()
    .references(() => companySecrets.id),
  encryptedValue: text('encrypted_value').notNull(),
  version: integer('version'),
  createdAt: timestamp('created_at', { withTimezone: true }),
});
