/**
 * API client — fetch-based, uses Vite proxy in dev
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: unknown,
  ) {
    super(`API Error: ${status} ${statusText}`);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let errorBody: unknown;
    try {
      errorBody = await res.json();
    } catch {
      // ignore
    }
    throw new ApiError(res.status, res.statusText, errorBody);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

// ── Types (matches actual server API responses — see API_RESPONSES.md) ──

export interface Company {
  id: string;
  name: string;
  description?: string | null;
  status?: string;
  issuePrefix?: string | null;
  issueCounter?: number;
  budgetMonthlyCents?: number | null;
  spentMonthlyCents?: number;
  requireBoardApprovalForNewAgents?: boolean;
  brandColor?: string | null;
  pauseReason?: string | null;
  pausedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  companyId: string;
  name: string;
  role?: string;
  title?: string | null;
  icon?: string | null;
  status: 'idle' | 'running' | 'paused' | 'terminated' | 'error' | 'pending_approval';
  reportsTo?: string | null;
  adapterType: string;
  adapterConfig?: Record<string, unknown> | null;
  runtimeConfig?: Record<string, unknown> | null;
  budgetMonthlyCents?: number | null;
  spentMonthlyCents?: number;
  permissions?: Record<string, unknown> | null;
  capabilities?: string | null;
  lastHeartbeatAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type IssueStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'plan_review' | 'plan_rejected' | 'blocked' | 'done' | 'cancelled';

export interface Issue {
  id: string;
  companyId: string;
  projectId?: string | null;
  projectWorkspaceId?: string | null;
  goalId?: string | null;
  parentId?: string | null;
  title: string;
  description?: string | null;
  status: IssueStatus;
  priority: string;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  checkoutRunId?: string | null;
  executionRunId?: string | null;
  executionAgentNameKey?: string | null;
  executionLockedAt?: string | null;
  createdByAgentId?: string | null;
  createdByUserId?: string | null;
  issueNumber?: number | null;
  identifier?: string | null;
  originKind?: string;
  originId?: string | null;
  originRunId?: string | null;
  requestDepth?: number;
  billingCode?: string | null;
  assigneeAdapterOverrides?: Record<string, unknown> | null;
  executionWorkspaceId?: string | null;
  executionWorkspacePreference?: string | null;
  executionWorkspaceSettings?: Record<string, unknown> | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  hiddenAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HeartbeatRun {
  id: string;
  companyId: string;
  agentId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out';
  taskScope?: string | null;
  taskId?: string | null;
  contextSnapshot?: Record<string, unknown> | null;
  exitCode?: number | null;
  signal?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  pid?: number | null;
  usage?: { inputTokens: number; outputTokens: number; cachedInputTokens: number } | null;
  costUsd?: string | null;
  provider?: string | null;
  biller?: string | null;
  model?: string | null;
  billingType?: string | null;
  summary?: string | null;
  sessionId?: string | null;
  sessionParams?: Record<string, unknown> | null;
}

export interface RunEvent {
  id: string;
  runId: string;
  companyId: string;
  kind: 'started' | 'log' | 'completed' | 'failed';
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  companyId: string;
  actorType: 'agent' | 'user' | 'system';
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface Goal {
  id: string;
  companyId: string;
  title: string;
  description?: string | null;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  level: 'strategic' | 'company' | 'project' | 'task';
  parentId?: string | null;
  ownerAgentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Routine {
  id: string;
  companyId: string;
  name: string;
  description?: string | null;
  triggerCron?: string | null;
  agentId?: string | null;
  enabled: boolean;
  lastRunAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Approval {
  id: string;
  companyId: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected' | 'revision_requested';
  requestedByAgentId?: string | null;
  requestedByUserId?: string | null;
  decidedByUserId?: string | null;
  decisionNote?: string | null;
  payload?: Record<string, unknown> | null;
  decidedAt?: string | null;
  createdAt: string;
}

export interface BudgetPolicy {
  id: string;
  companyId: string;
  scopeType: 'company' | 'agent' | 'project';
  scopeId?: string | null;
  metric: string;
  windowKind: 'monthly' | 'lifetime';
  amount: number;
  warnPercent: number;
  hardStopEnabled: boolean;
  notifyEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CostEntry {
  agentId: string;
  agentName: string;
  adapterType?: string;
  totalCostUsd: number;
  runCount: number;
}

export interface Secret {
  id: string;
  companyId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  type: 'agent' | 'issue' | 'project' | 'goal';
  id: string;
  title: string;
}

export interface Project {
  id: string;
  companyId: string;
  name: string;
  description?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// ── API Functions ──

export function fetchCompanies(limit = 50, offset = 0) {
  return api.get<Company[]>(`/companies?limit=${limit}&offset=${offset}`);
}

export function fetchCompany(id: string) {
  return api.get<Company>(`/companies/${id}`);
}

export function createCompany(data: { name: string; description?: string }) {
  return api.post<Company>('/companies', data);
}

export function fetchAgents(companyId: string, limit = 50, offset = 0) {
  return api.get<Agent[]>(`/agents?companyId=${companyId}&limit=${limit}&offset=${offset}`);
}

export function fetchAgent(agentId: string) {
  return api.get<Agent>(`/agents/${agentId}`);
}

export function createAgent(data: {
  companyId: string;
  name: string;
  role?: string;
  reportsTo?: string | null;
  adapterType: string;
  adapterConfig?: unknown;
  runtimeConfig?: unknown;
}) {
  return api.post<Agent>('/agents', data);
}

export function updateAgent(agentId: string, data: Partial<Agent>) {
  return api.patch<Agent>(`/agents/${agentId}`, data);
}

export function fetchIssues(
  companyId: string,
  filters?: { status?: string; priority?: string; assigneeAgentId?: string },
  limit = 100,
  offset = 0,
) {
  const params = new URLSearchParams({ companyId, limit: String(limit), offset: String(offset) });
  if (filters?.status) params.set('status', filters.status);
  if (filters?.priority) params.set('priority', filters.priority);
  if (filters?.assigneeAgentId) params.set('assigneeAgentId', filters.assigneeAgentId);
  return api.get<Issue[]>(`/issues?${params}`);
}

export function fetchIssue(issueId: string) {
  return api.get<Issue>(`/issues/${issueId}`);
}

export function fetchSubIssues(parentId: string) {
  return api.get<Issue[]>(`/issues?parentId=${parentId}`);
}

export function createIssue(data: {
  companyId: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeAgentId?: string;
  projectId?: string;
}) {
  return api.post<Issue>('/issues', data);
}

export function updateIssue(issueId: string, data: Partial<Issue>) {
  return api.patch<Issue>(`/issues/${issueId}`, data);
}

export function fetchRuns(companyId: string, agentId?: string, limit = 50, offset = 0) {
  const body: Record<string, unknown> = { companyId, limit, offset };
  if (agentId) body['agentId'] = agentId;
  return api.post<HeartbeatRun[]>('/heartbeat/runs', body);
}

export function fetchRunEvents(runId: string) {
  return api.get<RunEvent[]>(`/heartbeat/runs/${runId}/events`);
}

export function fetchActivity(companyId: string, limit = 50, offset = 0) {
  return api.get<ActivityEntry[]>(`/activity?companyId=${companyId}&limit=${limit}&offset=${offset}`);
}

// ── Goals ──

export function fetchGoals(companyId: string) {
  return api.get<Goal[]>(`/goals?companyId=${companyId}`);
}

export function fetchGoal(id: string) {
  return api.get<Goal>(`/goals/${id}`);
}

export function createGoal(data: {
  companyId: string;
  title: string;
  description?: string;
  status?: string;
  level: string;
  parentId?: string;
  ownerAgentId?: string;
}) {
  return api.post<Goal>('/goals', data);
}

// ── Routines ──

export function fetchRoutines(companyId: string) {
  return api.get<Routine[]>(`/routines?companyId=${companyId}`);
}

export function createRoutine(data: {
  companyId: string;
  name: string;
  description?: string;
  triggerCron?: string;
  agentId?: string;
  enabled?: boolean;
}) {
  return api.post<Routine>('/routines', data);
}

// ── Approvals ──

export function fetchApprovals(companyId: string) {
  return api.get<Approval[]>(`/approvals?companyId=${companyId}`);
}

export function decideApproval(id: string, data: { status: 'approved' | 'rejected' | 'revision_requested'; comment?: string }) {
  return api.patch<Approval>(`/approvals/${id}`, {
    status: data.status,
    decidedByUserId: 'user', // default actor
    decisionNote: data.comment,
  });
}

// ── Budget Policies ──

export function fetchBudgetPolicies(companyId: string) {
  return api.get<BudgetPolicy[]>(`/budget-policies?companyId=${companyId}`);
}

export function createBudgetPolicy(data: {
  companyId: string;
  scopeType: string;
  scopeId?: string;
  metric?: string;
  windowKind: string;
  amount: number;
  warnPercent?: number;
  hardStopEnabled?: boolean;
  notifyEnabled?: boolean;
}) {
  return api.post<BudgetPolicy>('/budget-policies', data);
}

// ── Costs ──

export function fetchCosts(companyId: string, timeRange?: { from: string; to: string }) {
  const params = new URLSearchParams({ companyId });
  if (timeRange) {
    params.set('from', timeRange.from);
    params.set('to', timeRange.to);
  }
  return api.get<CostEntry[]>(`/costs?${params}`);
}

// ── Secrets ──

export function fetchSecrets(companyId: string) {
  return api.get<Secret[]>(`/secrets?companyId=${companyId}`);
}

export function createSecret(data: { companyId: string; name: string; value: string }) {
  return api.post<Secret>('/secrets', data);
}

export function deleteSecret(id: string) {
  return api.delete<void>(`/secrets/${id}`);
}

// ── Search ──

export function searchAll(companyId: string, query: string) {
  return api.get<SearchResult[]>(`/search?companyId=${companyId}&q=${encodeURIComponent(query)}`);
}

// ── Company Update ──

export function updateCompany(id: string, data: Partial<Company>) {
  return api.patch<Company>(`/companies/${id}`, data);
}

// ── Adapters ──

export function fetchAdapterModels(adapterType: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return api.get<{ models: any[] }>(`/adapters/${encodeURIComponent(adapterType)}/models`);
}

// ── Issue Report & Reject ──

export interface IssueReport {
  issueTitle: string;
  status: string;
  completedAt: string;
  subtasks: Array<{
    title: string;
    status: string;
    agentName: string;
    summary: string;
  }>;
  totalRuns: number;
}

export function fetchIssueReport(issueId: string) {
  return api.get<IssueReport>(`/issues/${issueId}/report`);
}

export function rejectIssue(issueId: string, reason: string) {
  return api.post<{ rejected: boolean; reason: string; cancelledSubIssues: number }>(
    `/issues/${issueId}/reject`,
    { reason },
  );
}

// ── Work Products ──

export interface WorkProduct {
  id: string;
  companyId: string;
  projectId?: string | null;
  issueId: string;
  executionWorkspaceId?: string | null;
  type: string;
  provider: string;
  externalId?: string | null;
  title: string;
  url?: string | null;
  status: string;
  reviewState: string;
  isPrimary: boolean;
  healthStatus: string;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
  createdByRunId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function fetchWorkProducts(issueId: string) {
  return api.get<WorkProduct[]>(`/issues/${issueId}/work-products`);
}

// ── Projects ──

export interface ProjectWorkspace {
  id: string;
  projectId: string;
  companyId: string;
  cwd: string | null;
  repoUrl: string | null;
  branch: string | null;
  createdAt: string | null;
}

export function fetchProjects(companyId: string) {
  return api.get<Project[]>(`/projects?companyId=${companyId}`);
}

export function createProject(data: { companyId: string; name: string; description?: string }) {
  return api.post<Project>('/projects', data);
}

export function fetchProjectWorkspace(projectId: string) {
  return api.get<ProjectWorkspace | null>(`/projects/${projectId}/workspace`);
}

export function setProjectWorkspace(projectId: string, data: { cwd: string; repoUrl?: string; branch?: string }) {
  return api.post<ProjectWorkspace>(`/projects/${projectId}/workspace`, data);
}

export function updateProjectWorkspace(projectId: string, data: { cwd?: string; repoUrl?: string; branch?: string }) {
  return api.patch<ProjectWorkspace>(`/projects/${projectId}/workspace`, data);
}

export function validateWorkspacePath(cwd: string) {
  return api.post<{ valid: boolean; reason?: string }>('/projects/workspace/validate', { cwd });
}

export function validateRepoUrl(repoUrl: string) {
  return api.post<{ valid: boolean; reason?: string }>('/projects/workspace/validate-repo', { repoUrl });
}

export interface CloneWorkspaceResponse {
  cwd: string;
  repoUrl: string;
  branch: string;
  cloned: boolean;
}

export function cloneWorkspace(
  projectId: string,
  data: { repoUrl: string; targetDir?: string; branch?: string },
) {
  return api.post<CloneWorkspaceResponse>(`/projects/${projectId}/workspace/clone`, data);
}
