import { describe, it, expect } from 'vitest';

/**
 * Permission check logic tests — pure logic tests for the 4-layer system.
 */

interface MockActor {
  type: 'none' | 'board' | 'agent';
  userId?: string;
  agentId?: string;
  isInstanceAdmin?: boolean;
}

interface MockMembership {
  companyId: string;
  userId: string;
  role: 'owner' | 'member';
}

interface MockGrant {
  companyId: string;
  principalType: string;
  principalId: string;
  permissionKey: string;
  granted: boolean;
}

/**
 * Pure permission check logic — mirrors permissionService.hasPermission
 */
function hasPermission(
  actor: MockActor,
  companyId: string,
  permissionKey: string,
  opts: {
    instanceAdminUserIds: string[];
    memberships: MockMembership[];
    grants: MockGrant[];
  },
): boolean {
  // Agents check grants only
  if (actor.type === 'agent') {
    return opts.grants.some(
      (g) =>
        g.principalType === 'agent' &&
        g.principalId === actor.agentId &&
        g.permissionKey === permissionKey &&
        g.granted,
    );
  }

  if (actor.type !== 'board') return false;

  const userId = actor.userId!;

  // Layer 1: Instance admin
  if (actor.isInstanceAdmin) return true;
  if (opts.instanceAdminUserIds.includes(userId)) return true;

  // Layer 2: Company membership
  const membership = opts.memberships.find(
    (m) => m.companyId === companyId && m.userId === userId,
  );
  if (!membership) return false;
  if (membership.role === 'owner') return true;

  // Layer 3: Explicit grants
  const grant = opts.grants.find(
    (g) =>
      g.companyId === companyId &&
      g.principalType === 'user' &&
      g.principalId === userId &&
      g.permissionKey === permissionKey,
  );
  if (grant) return grant.granted;

  // Layer 4: Default member permissions
  return permissionKey.endsWith(':read');
}

describe('Permission check', () => {
  const companyId = 'company-1';
  const defaultOpts = {
    instanceAdminUserIds: [] as string[],
    memberships: [] as MockMembership[],
    grants: [] as MockGrant[],
  };

  it('instance admin has full access', () => {
    const actor: MockActor = { type: 'board', userId: 'admin-1', isInstanceAdmin: true };
    expect(hasPermission(actor, companyId, 'issues:write', defaultOpts)).toBe(true);
    expect(hasPermission(actor, companyId, 'agents:hire', defaultOpts)).toBe(true);
  });

  it('company owner has full access', () => {
    const actor: MockActor = { type: 'board', userId: 'owner-1', isInstanceAdmin: false };
    const opts = {
      ...defaultOpts,
      memberships: [{ companyId, userId: 'owner-1', role: 'owner' as const }],
    };
    expect(hasPermission(actor, companyId, 'issues:write', opts)).toBe(true);
  });

  it('company member can read by default', () => {
    const actor: MockActor = { type: 'board', userId: 'member-1', isInstanceAdmin: false };
    const opts = {
      ...defaultOpts,
      memberships: [{ companyId, userId: 'member-1', role: 'member' as const }],
    };
    expect(hasPermission(actor, companyId, 'issues:read', opts)).toBe(true);
  });

  it('company member cannot write by default', () => {
    const actor: MockActor = { type: 'board', userId: 'member-1', isInstanceAdmin: false };
    const opts = {
      ...defaultOpts,
      memberships: [{ companyId, userId: 'member-1', role: 'member' as const }],
    };
    expect(hasPermission(actor, companyId, 'issues:write', opts)).toBe(false);
  });

  it('explicit grant overrides default member permissions', () => {
    const actor: MockActor = { type: 'board', userId: 'member-1', isInstanceAdmin: false };
    const opts = {
      ...defaultOpts,
      memberships: [{ companyId, userId: 'member-1', role: 'member' as const }],
      grants: [
        {
          companyId,
          principalType: 'user',
          principalId: 'member-1',
          permissionKey: 'issues:write',
          granted: true,
        },
      ],
    };
    expect(hasPermission(actor, companyId, 'issues:write', opts)).toBe(true);
  });

  it('explicit deny overrides default read permission', () => {
    const actor: MockActor = { type: 'board', userId: 'member-1', isInstanceAdmin: false };
    const opts = {
      ...defaultOpts,
      memberships: [{ companyId, userId: 'member-1', role: 'member' as const }],
      grants: [
        {
          companyId,
          principalType: 'user',
          principalId: 'member-1',
          permissionKey: 'issues:read',
          granted: false,
        },
      ],
    };
    expect(hasPermission(actor, companyId, 'issues:read', opts)).toBe(false);
  });

  it('non-member has no access', () => {
    const actor: MockActor = { type: 'board', userId: 'outsider', isInstanceAdmin: false };
    expect(hasPermission(actor, companyId, 'issues:read', defaultOpts)).toBe(false);
  });

  it('none actor has no access', () => {
    const actor: MockActor = { type: 'none' };
    expect(hasPermission(actor, companyId, 'issues:read', defaultOpts)).toBe(false);
  });

  it('agent with granted permission has access', () => {
    const actor: MockActor = { type: 'agent', agentId: 'agent-1' };
    const opts = {
      ...defaultOpts,
      grants: [
        {
          companyId,
          principalType: 'agent',
          principalId: 'agent-1',
          permissionKey: 'issues:write',
          granted: true,
        },
      ],
    };
    expect(hasPermission(actor, companyId, 'issues:write', opts)).toBe(true);
  });

  it('agent without grant has no access', () => {
    const actor: MockActor = { type: 'agent', agentId: 'agent-1' };
    expect(hasPermission(actor, companyId, 'issues:write', defaultOpts)).toBe(false);
  });
});
