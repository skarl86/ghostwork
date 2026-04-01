/**
 * TanStack Query hooks for server state
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Agent, Issue, Company } from '@/lib/api';
import {
  fetchCompanies,
  fetchCompany,
  createCompany,
  updateCompany,
  fetchAgents,
  fetchAgent,
  createAgent,
  updateAgent,
  fetchIssues,
  fetchIssue,
  fetchSubIssues,
  createIssue,
  updateIssue,
  fetchRuns,
  fetchRunEvents,
  fetchActivity,
  fetchGoals,
  fetchGoal,
  createGoal,
  fetchRoutines,
  createRoutine,
  fetchApprovals,
  decideApproval,
  fetchBudgetPolicies,
  createBudgetPolicy,
  fetchCosts,
  fetchSecrets,
  createSecret,
  deleteSecret,
  searchAll,
  fetchAdapterModels,
  fetchIssueReport,
  rejectIssue,
  fetchProjects,
  createProject,
  fetchProjectWorkspace,
  setProjectWorkspace,
  updateProjectWorkspace,
} from '@/lib/api';

// ── Query Keys ──

export const queryKeys = {
  companies: ['companies'] as const,
  company: (id: string) => ['companies', id] as const,
  agents: (companyId: string) => ['agents', companyId] as const,
  agent: (id: string) => ['agents', 'detail', id] as const,
  issues: (companyId: string, filters?: Record<string, string>) =>
    ['issues', companyId, filters ?? {}] as const,
  issue: (id: string) => ['issues', 'detail', id] as const,
  subIssues: (parentId: string) => ['issues', 'subIssues', parentId] as const,
  runs: (companyId: string, agentId?: string) => ['runs', companyId, agentId] as const,
  runEvents: (runId: string) => ['runEvents', runId] as const,
  activity: (companyId: string) => ['activity', companyId] as const,
  goals: (companyId: string) => ['goals', companyId] as const,
  goal: (id: string) => ['goals', 'detail', id] as const,
  routines: (companyId: string) => ['routines', companyId] as const,
  approvals: (companyId: string) => ['approvals', companyId] as const,
  budgetPolicies: (companyId: string) => ['budgetPolicies', companyId] as const,
  costs: (companyId: string, timeRange?: { from: string; to: string }) =>
    ['costs', companyId, timeRange] as const,
  secrets: (companyId: string) => ['secrets', companyId] as const,
  search: (companyId: string, query: string) => ['search', companyId, query] as const,
  adapterModels: (adapterType: string) => ['adapterModels', adapterType] as const,
  projects: (companyId: string) => ['projects', companyId] as const,
  projectWorkspace: (projectId: string) => ['projectWorkspace', projectId] as const,
};

// ── Companies ──

export function useCompanies() {
  return useQuery({
    queryKey: queryKeys.companies,
    queryFn: () => fetchCompanies(),
  });
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: queryKeys.company(id),
    queryFn: () => fetchCompany(id),
    enabled: !!id,
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) => createCompany(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.companies });
    },
  });
}

// ── Agents ──

export function useAgents(companyId: string) {
  return useQuery({
    queryKey: queryKeys.agents(companyId),
    queryFn: () => fetchAgents(companyId),
    enabled: !!companyId,
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: queryKeys.agent(id),
    queryFn: () => fetchAgent(id),
    enabled: !!id,
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      companyId: string;
      name: string;
      role?: string;
      reportsTo?: string | null;
      adapterType: string;
      adapterConfig?: unknown;
      runtimeConfig?: unknown;
    }) => createAgent(data),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: queryKeys.agents(variables.companyId) });
    },
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, data }: { agentId: string; data: Partial<Agent> }) =>
      updateAgent(agentId, data),
    onSuccess: (result) => {
      if (result) {
        void qc.invalidateQueries({ queryKey: queryKeys.agents(result.companyId) });
        void qc.invalidateQueries({ queryKey: queryKeys.agent(result.id) });
      }
    },
  });
}

// ── Issues ──

export function useIssues(
  companyId: string,
  filters?: { status?: string; priority?: string; assigneeAgentId?: string },
) {
  return useQuery({
    queryKey: queryKeys.issues(companyId, filters as Record<string, string> | undefined),
    queryFn: () => fetchIssues(companyId, filters),
    enabled: !!companyId,
  });
}

export function useIssue(id: string) {
  return useQuery({
    queryKey: queryKeys.issue(id),
    queryFn: () => fetchIssue(id),
    enabled: !!id,
  });
}

export function useSubIssues(parentId: string) {
  return useQuery({
    queryKey: queryKeys.subIssues(parentId),
    queryFn: () => fetchSubIssues(parentId),
    enabled: !!parentId,
  });
}

export function useCreateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      companyId: string;
      title: string;
      description?: string;
      status?: string;
      priority?: string;
      assigneeAgentId?: string;
      projectId?: string;
    }) => createIssue(data),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['issues', variables.companyId] });
    },
  });
}

export function useUpdateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, data }: { issueId: string; data: Partial<Issue> }) =>
      updateIssue(issueId, data),
    onSuccess: (result) => {
      if (result) {
        void qc.invalidateQueries({ queryKey: ['issues', result.companyId] });
        void qc.invalidateQueries({ queryKey: queryKeys.issue(result.id) });
      }
    },
  });
}

// ── Runs ──

export function useRuns(companyId: string, agentId?: string) {
  return useQuery({
    queryKey: queryKeys.runs(companyId, agentId),
    queryFn: () => fetchRuns(companyId, agentId),
    enabled: !!companyId,
  });
}

export function useRunEvents(runId: string) {
  return useQuery({
    queryKey: queryKeys.runEvents(runId),
    queryFn: () => fetchRunEvents(runId),
    enabled: !!runId,
  });
}

// ── Activity ──

export function useActivity(companyId: string) {
  return useQuery({
    queryKey: queryKeys.activity(companyId),
    queryFn: () => fetchActivity(companyId),
    enabled: !!companyId,
  });
}

// ── Goals ──

export function useGoals(companyId: string) {
  return useQuery({
    queryKey: queryKeys.goals(companyId),
    queryFn: () => fetchGoals(companyId),
    enabled: !!companyId,
  });
}

export function useGoal(id: string) {
  return useQuery({
    queryKey: queryKeys.goal(id),
    queryFn: () => fetchGoal(id),
    enabled: !!id,
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      companyId: string;
      title: string;
      description?: string;
      status?: string;
      level: string;
      parentId?: string;
      ownerAgentId?: string;
      projectId?: string;
    }) => createGoal(data),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: queryKeys.goals(variables.companyId) });
    },
  });
}

// ── Routines ──

export function useRoutines(companyId: string) {
  return useQuery({
    queryKey: queryKeys.routines(companyId),
    queryFn: () => fetchRoutines(companyId),
    enabled: !!companyId,
  });
}

export function useCreateRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      companyId: string;
      name: string;
      description?: string;
      triggerCron?: string;
      agentId?: string;
      enabled?: boolean;
    }) => createRoutine(data),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: queryKeys.routines(variables.companyId) });
    },
  });
}

// ── Approvals ──

export function useApprovals(companyId: string) {
  return useQuery({
    queryKey: queryKeys.approvals(companyId),
    queryFn: () => fetchApprovals(companyId),
    enabled: !!companyId,
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status: 'approved' | 'rejected'; comment?: string } }) =>
      decideApproval(id, data),
    onSuccess: (result) => {
      if (result) {
        void qc.invalidateQueries({ queryKey: queryKeys.approvals(result.companyId) });
      }
    },
  });
}

// ── Budget Policies ──

export function useBudgetPolicies(companyId: string) {
  return useQuery({
    queryKey: queryKeys.budgetPolicies(companyId),
    queryFn: () => fetchBudgetPolicies(companyId),
    enabled: !!companyId,
  });
}

export function useCreateBudgetPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      companyId: string;
      scopeType: string;
      scopeId?: string;
      metric?: string;
      windowKind: string;
      amount: number;
      warnPercent?: number;
      hardStopEnabled?: boolean;
      notifyEnabled?: boolean;
    }) => createBudgetPolicy(data),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: queryKeys.budgetPolicies(variables.companyId) });
    },
  });
}

// ── Costs ──

export function useCosts(companyId: string, timeRange?: { from: string; to: string }) {
  return useQuery({
    queryKey: queryKeys.costs(companyId, timeRange),
    queryFn: () => fetchCosts(companyId, timeRange),
    enabled: !!companyId,
  });
}

// ── Secrets ──

export function useSecrets(companyId: string) {
  return useQuery({
    queryKey: queryKeys.secrets(companyId),
    queryFn: () => fetchSecrets(companyId),
    enabled: !!companyId,
  });
}

export function useCreateSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { companyId: string; name: string; value: string }) => createSecret(data),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: queryKeys.secrets(variables.companyId) });
    },
  });
}

export function useDeleteSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, companyId: _companyId }: { id: string; companyId: string }) => deleteSecret(id),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: queryKeys.secrets(variables.companyId) });
    },
  });
}

// ── Search ──

export function useSearch(companyId: string, query: string) {
  return useQuery({
    queryKey: queryKeys.search(companyId, query),
    queryFn: () => searchAll(companyId, query),
    enabled: !!companyId && query.length >= 2,
    staleTime: 10_000,
  });
}

// ── Company Update ──

// ── Adapter Models ──

export function useAdapterModels(adapterType: string) {
  return useQuery({
    queryKey: queryKeys.adapterModels(adapterType),
    queryFn: () => fetchAdapterModels(adapterType),
    enabled: !!adapterType,
    select: (data) => data.models,
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Company> }) => updateCompany(id, data),
    onSuccess: (result) => {
      if (result) {
        void qc.invalidateQueries({ queryKey: queryKeys.companies });
        void qc.invalidateQueries({ queryKey: queryKeys.company(result.id) });
      }
    },
  });
}

// ── Projects ──

export function useProjects(companyId: string) {
  return useQuery({
    queryKey: queryKeys.projects(companyId),
    queryFn: () => fetchProjects(companyId),
    enabled: !!companyId,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { companyId: string; name: string; description?: string }) =>
      createProject(data),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: queryKeys.projects(variables.companyId) });
    },
  });
}

export function useProjectWorkspace(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectWorkspace(projectId),
    queryFn: () => fetchProjectWorkspace(projectId),
    enabled: !!projectId,
  });
}

export function useSetProjectWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: { cwd: string; repoUrl?: string; branch?: string } }) =>
      setProjectWorkspace(projectId, data),
    onSuccess: (result) => {
      if (result) {
        void qc.invalidateQueries({ queryKey: queryKeys.projectWorkspace(result.projectId) });
      }
    },
  });
}

export function useUpdateProjectWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: { cwd?: string; repoUrl?: string; branch?: string } }) =>
      updateProjectWorkspace(projectId, data),
    onSuccess: (result) => {
      if (result) {
        void qc.invalidateQueries({ queryKey: queryKeys.projectWorkspace(result.projectId) });
      }
    },
  });
}

// ── Issue Report & Reject ──

export function useIssueReport(issueId: string) {
  return useQuery({
    queryKey: ['issueReport', issueId] as const,
    queryFn: () => fetchIssueReport(issueId),
    enabled: !!issueId,
  });
}

export function useRejectIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, reason }: { issueId: string; reason: string }) =>
      rejectIssue(issueId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues('') });
    },
  });
}
