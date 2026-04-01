/**
 * CLI API Client — fetch-based HTTP client for the Ghostwork server.
 */

import type { CliConfig } from './config.js';

export interface ApiClient {
  // Companies
  createCompany(name: string, description?: string): Promise<unknown>;
  listCompanies(): Promise<unknown[]>;

  // Portability
  exportPreview(companyId: string): Promise<unknown>;
  exportCompany(companyId: string): Promise<unknown>;
  importPreview(data: unknown): Promise<unknown>;
  importCompany(data: unknown, strategy?: string): Promise<unknown>;

  // Agents
  createAgent(companyId: string, name: string, adapterType: string): Promise<unknown>;
  listAgents(companyId: string): Promise<unknown[]>;

  // Issues
  createIssue(
    companyId: string,
    title: string,
    assigneeAgentId?: string,
  ): Promise<unknown>;
  listIssues(companyId: string): Promise<unknown[]>;

  // Heartbeat
  wakeup(companyId: string, agentId: string): Promise<unknown>;
  listRuns(companyId: string): Promise<unknown[]>;

  // Activity
  listActivity(companyId: string): Promise<unknown[]>;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiClientError(res.status, `${method} ${path} → ${res.status}: ${text}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

export function createApiClient(config: CliConfig): ApiClient {
  const base = config.apiUrl;

  return {
    // Companies
    async createCompany(name, description) {
      return request(base, 'POST', '/api/companies', { name, description });
    },
    async listCompanies() {
      return request(base, 'GET', '/api/companies') as Promise<unknown[]>;
    },

    // Agents
    async createAgent(companyId, name, adapterType) {
      return request(base, 'POST', '/api/agents', {
        companyId,
        name,
        adapterType,
      });
    },
    async listAgents(companyId) {
      return request(
        base,
        'GET',
        `/api/agents?companyId=${encodeURIComponent(companyId)}`,
      ) as Promise<unknown[]>;
    },

    // Issues
    async createIssue(companyId, title, assigneeAgentId) {
      return request(base, 'POST', '/api/issues', {
        companyId,
        title,
        assigneeAgentId: assigneeAgentId ?? null,
      });
    },
    async listIssues(companyId) {
      return request(
        base,
        'GET',
        `/api/issues?companyId=${encodeURIComponent(companyId)}`,
      ) as Promise<unknown[]>;
    },

    // Heartbeat
    async wakeup(companyId, agentId) {
      return request(base, 'POST', '/api/heartbeat/wakeup', {
        companyId,
        agentId,
        reason: 'manual',
      });
    },
    async listRuns(companyId) {
      return request(base, 'POST', '/api/heartbeat/runs', {
        companyId,
      }) as Promise<unknown[]>;
    },

    // Portability
    async exportPreview(companyId: string) {
      return request(base, 'POST', `/api/companies/${encodeURIComponent(companyId)}/exports/preview`);
    },
    async exportCompany(companyId: string) {
      return request(base, 'POST', `/api/companies/${encodeURIComponent(companyId)}/exports`);
    },
    async importPreview(data: unknown) {
      return request(base, 'POST', '/api/imports/preview', data);
    },
    async importCompany(data: unknown, strategy?: string) {
      return request(base, 'POST', '/api/imports', { data, strategy });
    },

    // Activity
    async listActivity(companyId) {
      return request(
        base,
        'GET',
        `/api/activity?companyId=${encodeURIComponent(companyId)}`,
      ) as Promise<unknown[]>;
    },
  };
}
