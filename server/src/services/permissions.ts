/**
 * Permission service — 4-layer authorization check.
 *
 * Layer 1: instance_user_roles (admin → full access)
 * Layer 2: company_memberships (owner/member)
 * Layer 3: principal_permission_grants (fine-grained)
 * Layer 4: agent permissions (JSONB field on agent record)
 */

import { eq, and } from 'drizzle-orm';
import {
  instanceUserRoles,
  companyMemberships,
  principalPermissionGrants,
} from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { NotFoundError, ConflictError } from '../errors.js';
import type { Actor } from '../plugins/actor.js';

export interface CreateMembershipInput {
  companyId: string;
  userId: string;
  role: 'owner' | 'member';
}

export interface CreateInstanceRoleInput {
  userId: string;
  role: string;
}

export interface GrantPermissionInput {
  companyId?: string | null;
  principalType: string; // 'user' | 'agent'
  principalId: string;
  permissionKey: string;
  granted?: boolean;
}

export function permissionService(db: Db) {
  return {
    // ── Instance User Roles ──

    async listInstanceRoles(limit = 50, offset = 0) {
      return db.select().from(instanceUserRoles).limit(limit).offset(offset);
    },

    async createInstanceRole(input: CreateInstanceRoleInput) {
      const rows = await db
        .insert(instanceUserRoles)
        .values({
          userId: input.userId,
          role: input.role,
          createdAt: new Date(),
        })
        .returning();
      const row = rows[0];
      if (!row) throw new ConflictError('Failed to create instance role');
      return row;
    },

    async removeInstanceRole(id: string) {
      const rows = await db
        .delete(instanceUserRoles)
        .where(eq(instanceUserRoles.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Instance role ${id} not found`);
      return row;
    },

    // ── Company Memberships ──

    async listMemberships(companyId: string, limit = 50, offset = 0) {
      return db
        .select()
        .from(companyMemberships)
        .where(eq(companyMemberships.companyId, companyId))
        .limit(limit)
        .offset(offset);
    },

    async createMembership(input: CreateMembershipInput) {
      const rows = await db
        .insert(companyMemberships)
        .values({
          companyId: input.companyId,
          userId: input.userId,
          role: input.role,
          createdAt: new Date(),
        })
        .returning();
      const row = rows[0];
      if (!row) throw new ConflictError('Failed to create membership');
      return row;
    },

    async removeMembership(id: string) {
      const rows = await db
        .delete(companyMemberships)
        .where(eq(companyMemberships.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Membership ${id} not found`);
      return row;
    },

    // ── Permission Grants ──

    async listGrants(companyId: string, limit = 50, offset = 0) {
      return db
        .select()
        .from(principalPermissionGrants)
        .where(eq(principalPermissionGrants.companyId, companyId))
        .limit(limit)
        .offset(offset);
    },

    async createGrant(input: GrantPermissionInput) {
      const rows = await db
        .insert(principalPermissionGrants)
        .values({
          companyId: input.companyId ?? null,
          principalType: input.principalType,
          principalId: input.principalId,
          permissionKey: input.permissionKey,
          granted: input.granted ?? true,
          createdAt: new Date(),
        })
        .returning();
      const row = rows[0];
      if (!row) throw new ConflictError('Failed to create permission grant');
      return row;
    },

    async removeGrant(id: string) {
      const rows = await db
        .delete(principalPermissionGrants)
        .where(eq(principalPermissionGrants.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Permission grant ${id} not found`);
      return row;
    },

    // ── Permission Check ──

    /**
     * Check if an actor has a specific permission for a company.
     * Checks the 4-layer hierarchy:
     *  1. Instance admin → always allowed
     *  2. Company membership owner → always allowed
     *  3. Explicit permission grant → check granted flag
     *  4. Company member → allowed for read, denied for write by default
     */
    async hasPermission(
      actor: Actor,
      companyId: string,
      permissionKey: string,
    ): Promise<boolean> {
      // Agents have limited permissions — check via grants only
      if (actor.type === 'agent') {
        const grants = await db
          .select()
          .from(principalPermissionGrants)
          .where(
            and(
              eq(principalPermissionGrants.principalType, 'agent'),
              eq(principalPermissionGrants.principalId, actor.agentId),
              eq(principalPermissionGrants.permissionKey, permissionKey),
            ),
          );
        return grants.some((g) => g.granted);
      }

      if (actor.type !== 'board') return false;

      const userId = actor.userId;

      // Layer 1: Instance admin → full access
      if (actor.isInstanceAdmin) return true;

      const adminRoles = await db
        .select()
        .from(instanceUserRoles)
        .where(
          and(
            eq(instanceUserRoles.userId, userId),
            eq(instanceUserRoles.role, 'admin'),
          ),
        );
      if (adminRoles.length > 0) return true;

      // Layer 2: Company membership
      const memberships = await db
        .select()
        .from(companyMemberships)
        .where(
          and(
            eq(companyMemberships.companyId, companyId),
            eq(companyMemberships.userId, userId),
          ),
        );
      const membership = memberships[0];
      if (!membership) return false; // Not a member → no access

      // Owner → full access
      if (membership.role === 'owner') return true;

      // Layer 3: Explicit permission grant
      const grants = await db
        .select()
        .from(principalPermissionGrants)
        .where(
          and(
            eq(principalPermissionGrants.companyId, companyId),
            eq(principalPermissionGrants.principalType, 'user'),
            eq(principalPermissionGrants.principalId, userId),
            eq(principalPermissionGrants.permissionKey, permissionKey),
          ),
        );
      if (grants.length > 0) {
        return grants.some((g) => g.granted);
      }

      // Layer 4: Default member permissions — read allowed, write denied
      return permissionKey.endsWith(':read');
    },
  };
}
