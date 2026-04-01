import { pgTable, text, uuid, timestamp, boolean } from 'drizzle-orm/pg-core';
import { companies } from './companies.js';

export const companyMemberships = pgTable('company_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }),
});

export const instanceUserRoles = pgTable('instance_user_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }),
});

export const principalPermissionGrants = pgTable('principal_permission_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id),
  principalType: text('principal_type').notNull(),
  principalId: text('principal_id').notNull(),
  permissionKey: text('permission_key').notNull(),
  granted: boolean('granted').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }),
});
