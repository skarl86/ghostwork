/**
 * Portability service — Export/Import company data.
 */

import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '@ghostwork/db';
import {
  companies,
  agents,
  projects,
  projectWorkspaces,
  issues,
  goals,
  routines,
  routineTriggers,
  budgetPolicies,
} from '@ghostwork/db';
import { NotFoundError, ConflictError } from '../errors.js';

// ── Types ──

export const EXPORT_VERSION = '1.0.0';
const SECRET_PLACEHOLDER = '***REDACTED***';

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export interface ExportPreview {
  company: { id: string; name: string };
  counts: {
    agents: number;
    projects: number;
    projectWorkspaces: number;
    issues: number;
    goals: number;
    routines: number;
    routineTriggers: number;
    budgetPolicies: number;
  };
}

export interface ExportPackage {
  metadata: {
    exportedAt: string;
    version: string;
    sourceInstanceId: string;
  };
  company: R;
  agents: R[];
  projects: R[];
  projectWorkspaces: R[];
  issues: R[];
  goals: R[];
  routines: R[];
  routineTriggers: R[];
  budgetPolicies: R[];
}

export type ConflictStrategy = 'rename' | 'skip';

export interface ImportPreview {
  company: { name: string };
  counts: {
    agents: number;
    projects: number;
    issues: number;
    goals: number;
    routines: number;
    budgetPolicies: number;
  };
  conflicts: {
    companies: string[];
    agents: string[];
  };
}

export interface ImportResult {
  companyId: string;
  imported: {
    agents: number;
    projects: number;
    projectWorkspaces: number;
    issues: number;
    goals: number;
    routines: number;
    routineTriggers: number;
    budgetPolicies: number;
  };
  skipped: {
    agents: number;
  };
}

// ── Helpers ──

function g(obj: R, key: string): any {
  return obj[key];
}

function gStr(obj: R, key: string): string {
  return obj[key] as string;
}

function gStrN(obj: R, key: string): string | null {
  return (obj[key] as string | null) ?? null;
}

function gNum(obj: R, key: string): number {
  return obj[key] as number;
}

function gNumN(obj: R, key: string): number | null {
  return (obj[key] as number | null) ?? null;
}

function gBoolN(obj: R, key: string): boolean | null {
  return (obj[key] as boolean | null) ?? null;
}

// ── Service ──

export function portabilityService(db: Db) {
  return {
    async previewExport(companyId: string): Promise<ExportPreview> {
      const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
      if (!company) throw new NotFoundError(`Company ${companyId} not found`);

      const agentRows = await db.select().from(agents).where(eq(agents.companyId, companyId));
      const projectRows = await db.select().from(projects).where(eq(projects.companyId, companyId));
      const pwRows = await db
        .select()
        .from(projectWorkspaces)
        .where(eq(projectWorkspaces.companyId, companyId));
      const issueRows = await db.select().from(issues).where(eq(issues.companyId, companyId));
      const goalRows = await db.select().from(goals).where(eq(goals.companyId, companyId));

      const routineRows = await db
        .select()
        .from(routines)
        .where(eq(routines.companyId, companyId));
      const routineIds = routineRows.map((r) => r.id);
      let triggerCount = 0;
      for (const rid of routineIds) {
        const t = await db
          .select()
          .from(routineTriggers)
          .where(eq(routineTriggers.routineId, rid));
        triggerCount += t.length;
      }

      const budgetRows = await db
        .select()
        .from(budgetPolicies)
        .where(eq(budgetPolicies.companyId, companyId));

      return {
        company: { id: company.id, name: company.name },
        counts: {
          agents: agentRows.length,
          projects: projectRows.length,
          projectWorkspaces: pwRows.length,
          issues: issueRows.length,
          goals: goalRows.length,
          routines: routineRows.length,
          routineTriggers: triggerCount,
          budgetPolicies: budgetRows.length,
        },
      };
    },

    async exportCompany(companyId: string): Promise<ExportPackage> {
      const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
      if (!company) throw new NotFoundError(`Company ${companyId} not found`);

      const agentRows = await db.select().from(agents).where(eq(agents.companyId, companyId));
      const projectRows = await db.select().from(projects).where(eq(projects.companyId, companyId));
      const pwRows = await db
        .select()
        .from(projectWorkspaces)
        .where(eq(projectWorkspaces.companyId, companyId));
      const issueRows = await db.select().from(issues).where(eq(issues.companyId, companyId));
      const goalRows = await db.select().from(goals).where(eq(goals.companyId, companyId));
      const routineRows = await db
        .select()
        .from(routines)
        .where(eq(routines.companyId, companyId));

      const routineIds = routineRows.map((r) => r.id);
      let triggerRows: R[] = [];
      for (const rid of routineIds) {
        const t = await db
          .select()
          .from(routineTriggers)
          .where(eq(routineTriggers.routineId, rid));
        triggerRows = triggerRows.concat(t as R[]);
      }

      const budgetRows = await db
        .select()
        .from(budgetPolicies)
        .where(eq(budgetPolicies.companyId, companyId));

      // Scrub secrets from adapter config
      const scrubbed = agentRows.map((a) => {
        const config = a.adapterConfig as R | null;
        if (config && typeof config === 'object') {
          const cleaned = { ...config };
          for (const key of Object.keys(cleaned)) {
            if (/key|secret|token|password/i.test(key)) {
              cleaned[key] = SECRET_PLACEHOLDER;
            }
          }
          return { ...a, adapterConfig: cleaned };
        }
        return a;
      });

      return {
        metadata: {
          exportedAt: new Date().toISOString(),
          version: EXPORT_VERSION,
          sourceInstanceId: companyId,
        },
        company: company as unknown as R,
        agents: scrubbed as unknown as R[],
        projects: projectRows as unknown as R[],
        projectWorkspaces: pwRows as unknown as R[],
        issues: issueRows as unknown as R[],
        goals: goalRows as unknown as R[],
        routines: routineRows as unknown as R[],
        routineTriggers: triggerRows,
        budgetPolicies: budgetRows as unknown as R[],
      };
    },

    async previewImport(data: ExportPackage): Promise<ImportPreview> {
      const companyName = gStr(data.company, 'name');

      const existingCompanies = await db
        .select()
        .from(companies)
        .where(eq(companies.name, companyName));
      const companyConflicts = existingCompanies.map((c) => c.name);

      const agentConflicts: string[] = [];
      for (const agent of data.agents) {
        const name = gStr(agent, 'name');
        const existing = await db.select().from(agents).where(eq(agents.name, name));
        if (existing.length > 0) {
          agentConflicts.push(name);
        }
      }

      return {
        company: { name: companyName },
        counts: {
          agents: data.agents.length,
          projects: data.projects.length,
          issues: data.issues.length,
          goals: data.goals.length,
          routines: data.routines.length,
          budgetPolicies: data.budgetPolicies.length,
        },
        conflicts: {
          companies: companyConflicts,
          agents: agentConflicts,
        },
      };
    },

    async importCompany(
      data: ExportPackage,
      strategy: ConflictStrategy = 'rename',
    ): Promise<ImportResult> {
      return db.transaction(async (tx) => {
        const uuidMap = new Map<string, string>();

        function remap(oldId: string): string {
          if (!oldId) return oldId;
          let newId = uuidMap.get(oldId);
          if (!newId) {
            newId = randomUUID();
            uuidMap.set(oldId, newId);
          }
          return newId;
        }

        function remapN(oldId: string | null | undefined): string | null {
          if (!oldId) return null;
          return remap(oldId);
        }

        // 1. Import company
        const oldCompanyId = gStr(data.company, 'id');
        const newCompanyId = remap(oldCompanyId);

        let companyName = gStr(data.company, 'name');
        const existingCompanies = await tx
          .select()
          .from(companies)
          .where(eq(companies.name, companyName));

        if (existingCompanies.length > 0) {
          if (strategy === 'skip') {
            throw new ConflictError(`Company "${companyName}" already exists and strategy is skip`);
          }
          companyName = `${companyName} (imported ${new Date().toISOString().slice(0, 10)})`;
        }

        await tx.insert(companies).values({
          id: newCompanyId,
          name: companyName,
          description: gStrN(data.company, 'description'),
          status: 'active',
        });

        // 2. Import agents
        let skippedAgents = 0;
        for (const agent of data.agents) {
          const role = gStr(agent, 'role');
          const agentName = gStr(agent, 'name');

          if (role === 'ceo') {
            const existingCeo = await tx
              .select()
              .from(agents)
              .where(eq(agents.companyId, newCompanyId));
            const hasCeo = existingCeo.some((a) => a.role === 'ceo');
            if (hasCeo) {
              skippedAgents++;
              remap(gStr(agent, 'id'));
              continue;
            }
          }

          let finalName = agentName;
          if (strategy === 'rename') {
            const existing = await tx.select().from(agents).where(eq(agents.name, agentName));
            if (existing.length > 0) {
              finalName = `${agentName} (imported)`;
            }
          }

          const newAgentId = remap(gStr(agent, 'id'));

          await tx.insert(agents).values({
            id: newAgentId,
            companyId: newCompanyId,
            name: finalName,
            role: role || 'general',
            title: gStrN(agent, 'title'),
            icon: gStrN(agent, 'icon'),
            status: 'idle',
            reportsTo: remapN(gStrN(agent, 'reportsTo')),
            adapterType: gStr(agent, 'adapterType'),
            adapterConfig: g(agent, 'adapterConfig') ?? null,
            runtimeConfig: g(agent, 'runtimeConfig') ?? null,
            budgetMonthlyCents: gNumN(agent, 'budgetMonthlyCents'),
          });
        }

        // 3. Import projects
        for (const project of data.projects) {
          await tx.insert(projects).values({
            id: remap(gStr(project, 'id')),
            companyId: newCompanyId,
            name: gStr(project, 'name'),
            description: gStrN(project, 'description'),
            status: gStrN(project, 'status'),
          });
        }

        // 4. Import project workspaces
        for (const pw of data.projectWorkspaces) {
          await tx.insert(projectWorkspaces).values({
            id: remap(gStr(pw, 'id')),
            projectId: remap(gStr(pw, 'projectId')),
            companyId: newCompanyId,
            cwd: gStrN(pw, 'cwd'),
            repoUrl: gStrN(pw, 'repoUrl'),
            branch: gStrN(pw, 'branch'),
          });
        }

        // 5. Import goals
        for (const goal of data.goals) {
          await tx.insert(goals).values({
            id: remap(gStr(goal, 'id')),
            companyId: newCompanyId,
            title: gStr(goal, 'title'),
            description: gStrN(goal, 'description'),
            level: gStr(goal, 'level'),
            status: gStr(goal, 'status'),
            parentId: remapN(gStrN(goal, 'parentId')),
            ownerAgentId: remapN(gStrN(goal, 'ownerAgentId')),
          });
        }

        // 6. Import issues
        const sortedIssues = [...data.issues].sort((a, b) => {
          const aDepth = (g(a, 'requestDepth') as number) || 0;
          const bDepth = (g(b, 'requestDepth') as number) || 0;
          return aDepth - bDepth;
        });

        for (const issue of sortedIssues) {
          await tx.insert(issues).values({
            id: remap(gStr(issue, 'id')),
            companyId: newCompanyId,
            projectId: remapN(gStrN(issue, 'projectId')),
            projectWorkspaceId: remapN(gStrN(issue, 'projectWorkspaceId')),
            goalId: remapN(gStrN(issue, 'goalId')),
            parentId: remapN(gStrN(issue, 'parentId')),
            title: gStr(issue, 'title'),
            description: gStrN(issue, 'description'),
            status: gStr(issue, 'status'),
            priority: gStr(issue, 'priority'),
            assigneeAgentId: remapN(gStrN(issue, 'assigneeAgentId')),
            originKind: gStr(issue, 'originKind') || 'manual',
            requestDepth: gNum(issue, 'requestDepth') || 0,
          });
        }

        // 7. Import routines
        for (const routine of data.routines) {
          await tx.insert(routines).values({
            id: remap(gStr(routine, 'id')),
            companyId: newCompanyId,
            projectId: remapN(gStrN(routine, 'projectId')),
            name: gStr(routine, 'name'),
            description: gStrN(routine, 'description'),
            status: gStrN(routine, 'status'),
          });
        }

        // 8. Import routine triggers
        for (const trigger of data.routineTriggers) {
          await tx.insert(routineTriggers).values({
            id: remap(gStr(trigger, 'id')),
            routineId: remap(gStr(trigger, 'routineId')),
            triggerType: gStr(trigger, 'triggerType'),
            config: g(trigger, 'config'),
          });
        }

        // 9. Import budget policies
        for (const bp of data.budgetPolicies) {
          await tx.insert(budgetPolicies).values({
            id: remap(gStr(bp, 'id')),
            companyId: newCompanyId,
            scopeType: gStr(bp, 'scopeType'),
            scopeId: remapN(gStrN(bp, 'scopeId')),
            metric: gStr(bp, 'metric'),
            windowKind: gStr(bp, 'windowKind'),
            amount: gNum(bp, 'amount'),
            warnPercent: gNumN(bp, 'warnPercent'),
            hardStopEnabled: gBoolN(bp, 'hardStopEnabled'),
            notifyEnabled: gBoolN(bp, 'notifyEnabled'),
          });
        }

        return {
          companyId: newCompanyId,
          imported: {
            agents: data.agents.length - skippedAgents,
            projects: data.projects.length,
            projectWorkspaces: data.projectWorkspaces.length,
            issues: data.issues.length,
            goals: data.goals.length,
            routines: data.routines.length,
            routineTriggers: data.routineTriggers.length,
            budgetPolicies: data.budgetPolicies.length,
          },
          skipped: {
            agents: skippedAgents,
          },
        };
      });
    },
  };
}
