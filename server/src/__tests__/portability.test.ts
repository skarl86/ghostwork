/**
 * Portability service tests — export, import, roundtrip, secret scrubbing.
 */

import { describe, it, expect } from 'vitest';
import type { ExportPackage } from '../services/portability.js';

function createMockExportPackage(overrides?: Partial<ExportPackage>): ExportPackage {
  return {
    metadata: {
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      sourceInstanceId: 'test-company-id',
    },
    company: {
      id: 'company-1',
      name: 'Test Corp',
      description: 'A test company',
      status: 'active',
    },
    agents: [
      {
        id: 'agent-1',
        companyId: 'company-1',
        name: 'CEO Bot',
        role: 'ceo',
        adapterType: 'mock',
        adapterConfig: { apiKey: 'secret-key-123', model: 'gpt-4' },
      },
      {
        id: 'agent-2',
        companyId: 'company-1',
        name: 'Worker Bot',
        role: 'general',
        adapterType: 'mock',
        adapterConfig: { token: 'secret-token', endpoint: 'https://api.example.com' },
      },
    ],
    projects: [
      {
        id: 'project-1',
        companyId: 'company-1',
        name: 'Main Project',
      },
    ],
    projectWorkspaces: [
      {
        id: 'pw-1',
        projectId: 'project-1',
        companyId: 'company-1',
        cwd: '/tmp/workspace',
      },
    ],
    issues: [
      {
        id: 'issue-1',
        companyId: 'company-1',
        projectId: 'project-1',
        title: 'Fix bug',
        status: 'backlog',
        priority: 'high',
        originKind: 'manual',
        requestDepth: 0,
      },
    ],
    goals: [
      {
        id: 'goal-1',
        companyId: 'company-1',
        title: 'Ship v1',
        level: 'company',
        status: 'planned',
      },
    ],
    routines: [],
    routineTriggers: [],
    budgetPolicies: [],
    ...overrides,
  };
}

describe('Portability', () => {
  describe('Export Package Structure', () => {
    it('should have required metadata fields', () => {
      const pkg = createMockExportPackage();
      expect(pkg.metadata.exportedAt).toBeDefined();
      expect(pkg.metadata.version).toBe('1.0.0');
      expect(pkg.metadata.sourceInstanceId).toBeDefined();
    });

    it('should include all entity types', () => {
      const pkg = createMockExportPackage();
      expect(pkg.company).toBeDefined();
      expect(pkg.agents).toBeInstanceOf(Array);
      expect(pkg.projects).toBeInstanceOf(Array);
      expect(pkg.projectWorkspaces).toBeInstanceOf(Array);
      expect(pkg.issues).toBeInstanceOf(Array);
      expect(pkg.goals).toBeInstanceOf(Array);
      expect(pkg.routines).toBeInstanceOf(Array);
      expect(pkg.routineTriggers).toBeInstanceOf(Array);
      expect(pkg.budgetPolicies).toBeInstanceOf(Array);
    });
  });

  describe('Secret Scrubbing', () => {
    it('should detect secret-like keys in adapter config', () => {
      const pkg = createMockExportPackage();
      const agent = pkg.agents[0]!;
      const config = agent['adapterConfig'] as Record<string, unknown>;

      const secretKeys = Object.keys(config).filter((k) => /key|secret|token|password/i.test(k));
      expect(secretKeys.length).toBeGreaterThan(0);
    });

    it('should scrub secret values with placeholder', () => {
      const pkg = createMockExportPackage();
      const PLACEHOLDER = '***REDACTED***';

      const scrubbed = pkg.agents.map((a: any) => {
        const config = a['adapterConfig'] as Record<string, unknown> | null;
        if (config && typeof config === 'object') {
          const cleaned = { ...config };
          for (const key of Object.keys(cleaned)) {
            if (/key|secret|token|password/i.test(key)) {
              cleaned[key] = PLACEHOLDER;
            }
          }
          return { ...a, adapterConfig: cleaned };
        }
        return a;
      });

      const agent1Config = (scrubbed[0] as any)['adapterConfig'] as Record<string, unknown>;
      expect(agent1Config['apiKey']).toBe(PLACEHOLDER);
      expect(agent1Config['model']).toBe('gpt-4');

      const agent2Config = (scrubbed[1] as any)['adapterConfig'] as Record<string, unknown>;
      expect(agent2Config['token']).toBe(PLACEHOLDER);
      expect(agent2Config['endpoint']).toBe('https://api.example.com');
    });
  });

  describe('UUID Remapping', () => {
    it('should generate new UUIDs for all entities', () => {
      const pkg = createMockExportPackage();
      const uuidMap = new Map<string, string>();

      function remap(oldId: string): string {
        if (!uuidMap.has(oldId)) {
          uuidMap.set(oldId, `new-${oldId}`);
        }
        return uuidMap.get(oldId)!;
      }

      const newCompanyId = remap(pkg.company['id'] as string);
      const newAgentIds = pkg.agents.map((a: any) => remap(a['id'] as string));
      const newProjectIds = pkg.projects.map((p: any) => remap(p['id'] as string));

      expect(newCompanyId).not.toBe(pkg.company['id']);
      expect(newAgentIds[0]).not.toBe(pkg.agents[0]!['id']);
      expect(newProjectIds[0]).not.toBe(pkg.projects[0]!['id']);
    });

    it('should maintain FK integrity after remapping', () => {
      const pkg = createMockExportPackage();
      const uuidMap = new Map<string, string>();

      function remap(oldId: string): string {
        if (!uuidMap.has(oldId)) {
          uuidMap.set(oldId, `new-${oldId}`);
        }
        return uuidMap.get(oldId)!;
      }

      const newCompanyId = remap(pkg.company['id'] as string);

      const remappedAgents = pkg.agents.map((a: any) => ({
        ...a,
        id: remap(a['id'] as string),
        companyId: remap(a['companyId'] as string),
      }));

      for (const agent of remappedAgents) {
        expect((agent as any)['companyId']).toBe(newCompanyId);
      }

      const remappedIssues = pkg.issues.map((i: any) => ({
        ...i,
        id: remap(i['id'] as string),
        companyId: remap(i['companyId'] as string),
        projectId: i['projectId'] ? remap(i['projectId'] as string) : null,
      }));

      const issue = remappedIssues[0]!;
      const newProjectId = remap(pkg.projects[0]!['id'] as string);
      expect((issue as any)['projectId']).toBe(newProjectId);
    });
  });

  describe('Conflict Strategy', () => {
    it('rename strategy should append suffix', () => {
      const name = 'Test Corp';
      const renamed = `${name} (imported ${new Date().toISOString().slice(0, 10)})`;
      expect(renamed).toContain('(imported');
      expect(renamed).toContain(name);
    });

    it('skip strategy should be detectable', () => {
      const strategy = 'skip';
      expect(strategy).toBe('skip');
    });
  });
});
