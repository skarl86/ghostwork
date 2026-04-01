/**
 * Heartbeat Execute Flow — ties adapters to the heartbeat engine.
 *
 * executeRun():
 *  1. Look up adapter from registry
 *  2. Issue checkout: fetch and lock issue (if issue run)
 *  3. Mark agent as running + publish agent.status → running
 *  4. Build AdapterExecutionContext (context, skills, workspace cwd)
 *  5. Track in runningProcesses + call adapter.execute()
 *  6. Determine terminal status from adapter result
 *  7. Complete run via completeRun()
 *  8. Update issue status (Dev↔QA flow, PM orchestration)
 *  9. Publish run.status → terminal
 * 10. Update agent_runtime_state with session info
 * 11. Reset agent status to idle (if no other active runs)
 * 12. Remove from runningProcesses (finally)
 */

import { eq, and, ne, desc, inArray } from 'drizzle-orm';
import { agentRuntimeState, agents, issues, heartbeatRuns, projectWorkspaces, issueWorkProducts } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { workProductService } from '../services/work-products.js';
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterRegistry,
} from '@ghostwork/adapters';
import { completeRun, type CompleteRunInput } from './completion.js';

/**
 * Run statuses considered "active" — used when checking whether an agent
 * still has pending work before transitioning it back to idle.
 *
 * Includes `deferred_issue_execution` because that status is non-terminal:
 * the run will transition back to `queued` once the issue lock releases.
 */
export const ACTIVE_RUN_STATUSES = ['queued', 'running', 'deferred_issue_execution'] as const;
import { checkoutIssue, releaseIssue } from './checkout.js';
import { logRunEvent } from './events.js';
import type { ProcessHandle } from './types.js';
import type { LiveEventBus } from '../realtime/live-events.js';
import { publishLogChunked } from '../realtime/live-events.js';
import { activityService } from '../services/activity.js';
import {
  parsePMResponse,
  parsePMReview,
  createSubIssues,
  checkSubIssuesComplete,
  getSubIssueSummaries,
  handlePMReviewDecision,
  generateSimpleCompletionReport,
  storeCompletionReport,
} from './pm-orchestrator.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Project root — skills/ lives here */
const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');

/** Map agent role → skill directory names (relative to skills/) */
function getSkillDirsForRole(role: string): string[] {
  const base = resolve(PROJECT_ROOT, 'skills', 'base');
  switch (role) {
    case 'engineer':
    case 'developer':
      return [base, resolve(PROJECT_ROOT, 'skills', 'engineer')];
    case 'qa':
    case 'reviewer':
    case '리뷰어':
      return [base, resolve(PROJECT_ROOT, 'skills', 'qa')];
    case 'pm':
      return [base, resolve(PROJECT_ROOT, 'skills', 'pm')];
    case 'plan-reviewer':
      return [base, resolve(PROJECT_ROOT, 'skills', 'plan-reviewer')];
    case 'designer':
      return [base, resolve(PROJECT_ROOT, 'skills', 'designer')];
    default:
      return [base];
  }
}

/** Roles considered developer-type (complete → in_review when QA exists) */
const DEVELOPER_ROLES = new Set(['engineer', 'developer', 'general']);

/** Roles considered QA/reviewer (auto-pick in_review issues) */
export const QA_ROLES = new Set(['qa', 'reviewer', '리뷰어']);

/** Roles considered plan-reviewer (auto-pick plan_review issues) */
export const PLAN_REVIEW_ROLES = new Set(['plan-reviewer']);

/** Explicit rejection patterns — checked BEFORE approval to avoid false positives */
export const REJECTION_PATTERNS = [/\brejected?\b/i, /\bfail(ed|ure|s)?\b/i, /\bnot\s+approved?\b/i];

/** Approval signal patterns in QA run summaries */
export const APPROVAL_PATTERNS = [/\bapproved?\b/i, /\blooks?\s*good\b/i, /\blgtm\b/i];

/**
 * Extract PR URLs from a summary string.
 * Matches GitHub/GitLab PR/MR URLs.
 */
export function parsePRUrls(summary: string): Array<{ url: string; provider: string; externalId: string }> {
  const prPattern = /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+)/g;
  const results: Array<{ url: string; provider: string; externalId: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = prPattern.exec(summary)) !== null) {
    results.push({ url: match[0], provider: 'github', externalId: match[1]! });
  }
  return results;
}

/**
 * Extract branch name from summary text.
 * Looks for patterns like "branch: feature/x" or "on branch `feature/x`".
 */
export function parseBranchName(summary: string): string | null {
  const patterns = [
    /branch[:\s]+[`"]?([a-zA-Z0-9_./-]+)[`"]?/i,
    /on\s+(?:the\s+)?branch\s+[`"]?([a-zA-Z0-9_./-]+)[`"]?/i,
    /pushed?\s+to\s+[`"]?([a-zA-Z0-9_./-]+)[`"]?/i,
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(summary);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Auto-register a work product (PR) from a developer's summary.
 */
async function registerWorkProductFromSummary(
  db: Db,
  issueId: string,
  companyId: string,
  summary: string,
  runId: string,
  projectId: string | null,
): Promise<void> {
  const prs = parsePRUrls(summary);
  if (prs.length === 0) return;

  const wpSvc = workProductService(db);

  for (const pr of prs) {
    // Check if this PR is already registered
    const existing = await wpSvc.listForIssue(issueId);
    const alreadyExists = existing.some(
      (wp) => wp.type === 'pull_request' && wp.provider === pr.provider && wp.externalId === pr.externalId,
    );
    if (alreadyExists) continue;

    await wpSvc.createForIssue(issueId, companyId, {
      type: 'pull_request',
      provider: pr.provider,
      externalId: pr.externalId,
      title: `PR #${pr.externalId}`,
      url: pr.url,
      status: 'open',
      reviewState: 'none',
      isPrimary: prs.indexOf(pr) === 0,
      createdByRunId: runId,
      projectId,
    });
  }
}

/**
 * Update all open work products for an issue to a given review state.
 */
async function updateWorkProductReviewState(
  db: Db,
  issueId: string,
  reviewState: 'none' | 'approved' | 'changes_requested',
): Promise<void> {
  await db
    .update(issueWorkProducts)
    .set({ reviewState, updatedAt: new Date() })
    .where(
      and(
        eq(issueWorkProducts.issueId, issueId),
        eq(issueWorkProducts.type, 'pull_request'),
        eq(issueWorkProducts.status, 'open'),
      ),
    );
}

/**
 * Get work product info for the developer rework prompt.
 */
async function getWorkProductInfo(db: Db, issueId: string): Promise<{ prUrl: string; branchName: string | null } | null> {
  const wpSvc = workProductService(db);
  const products = await wpSvc.listForIssue(issueId);
  const pr = products.find((wp) => wp.type === 'pull_request' && wp.status === 'open');
  if (!pr) return null;
  return {
    prUrl: pr.url ?? '',
    branchName: (pr.metadata?.['branchName'] as string | null) ?? null,
  };
}

export interface ExecuteRunInput {
  run: {
    id: string;
    agentId: string;
    companyId: string;
    taskScope?: string | null;
    taskId?: string | null;
    contextSnapshot?: Record<string, unknown> | null;
  };
  agent: {
    id: string;
    companyId: string;
    name: string;
    adapterType: string;
    adapterConfig?: Record<string, unknown> | null;
    runtimeConfig?: Record<string, unknown> | null;
  };
  sessionId?: string | null;
  sessionParams?: Record<string, unknown> | null;
  authToken?: string;
  apiUrl?: string;
}

/**
 * Execute a single run end-to-end.
 */
export async function executeRun(
  db: Db,
  input: ExecuteRunInput,
  adapterRegistry: AdapterRegistry,
  runningProcesses: Map<string, ProcessHandle>,
  eventBus?: LiveEventBus,
): Promise<{ id: string; status: string }> {
  const { run, agent } = input;

  // 1. Look up adapter
  const adapter = adapterRegistry.get(agent.adapterType);
  if (!adapter) {
    return completeRun(db, run.id, 'failed', {
      exitCode: 1,
      summary: `Unknown adapter type: ${agent.adapterType}`,
    });
  }

  // 2. Issue checkout: if this run is for an issue, fetch and lock it
  let issueData: { id: string; title: string; description: string | null; status: string } | null = null;
  const isIssueRun = run.taskScope === 'issue' && run.taskId;

  if (isIssueRun) {
    const issueRows = await db.select().from(issues).where(eq(issues.id, run.taskId!));
    const issue = issueRows[0];

    if (!issue) {
      return completeRun(db, run.id, 'failed', {
        exitCode: 1,
        summary: `Issue ${run.taskId} not found`,
      });
    }

    // Checkout (lock) the issue
    try {
      await checkoutIssue(db, issue.id, agent.id, run.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Checkout failed';
      return completeRun(db, run.id, 'failed', {
        exitCode: 1,
        summary: `Issue checkout failed: ${msg}`,
      });
    }

    // Transition issue to in_progress if it's todo, backlog, or plan_review
    if (issue.status === 'todo' || issue.status === 'backlog' || issue.status === 'plan_review') {
      await db
        .update(issues)
        .set({ status: 'in_progress', startedAt: new Date(), updatedAt: new Date() })
        .where(eq(issues.id, issue.id));
    }

    issueData = { id: issue.id, title: issue.title, description: issue.description, status: issue.status };
  }

  // 3. Mark agent as running
  await db
    .update(agents)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(agents.id, agent.id));

  eventBus?.publish({
    companyId: run.companyId,
    type: 'agent.status',
    payload: {
      agentId: agent.id,
      status: 'running',
    },
  });

  // Publish run status → running
  eventBus?.publish({
    companyId: run.companyId,
    type: 'heartbeat.run.status',
    payload: {
      runId: run.id,
      agentId: agent.id,
      status: 'running',
    },
  });

  // 4. Build execution context
  const contextSnapshot = (run.contextSnapshot as Record<string, unknown>) ?? {};

  // If issue run, inject prompt and issue env vars into context
  if (issueData) {
    const agentRole = await getAgentRole(db, agent.id);
    let prompt: string;

    if (PLAN_REVIEW_ROLES.has(agentRole)) {
      // Plan reviewer — build plan review prompt
      prompt = buildPlanReviewPrompt(issueData);
    } else if (QA_ROLES.has(agentRole)) {
      // QA agent — build review prompt with previous dev work
      const prevSummary = await getPreviousRunSummary(db, issueData.id, run.id);
      prompt = buildQAPrompt(issueData, prevSummary);
    } else if (agentRole === 'pm') {
      // PM agent — check if this is a review phase (sub-issues exist and are all done)
      prompt = await buildPMPrompt(db, issueData);
    } else if (DEVELOPER_ROLES.has(agentRole)) {
      // Developer agent — check if there's QA feedback to address
      const qaFeedback = await getQAFeedback(db, issueData.id, run.id);
      const wpInfo = qaFeedback ? await getWorkProductInfo(db, issueData.id) : null;
      prompt = buildDeveloperPrompt(issueData, qaFeedback, wpInfo);
    } else {
      prompt = `Task: ${issueData.title}\n\nDescription: ${issueData.description || 'No description'}\n\nPlease complete this task.`;
    }

    contextSnapshot['prompt'] = prompt;
    contextSnapshot['GHOSTWORK_TASK_PROMPT'] = prompt;
    contextSnapshot['GHOSTWORK_ISSUE_ID'] = issueData.id;
    contextSnapshot['GHOSTWORK_ISSUE_TITLE'] = issueData.title;
  }

  // Resolve workspace cwd from project
  let workspaceCwd: string | undefined;
  if (isIssueRun && issueData) {
    // Get projectId from the issue
    const issueRows2 = await db.select({ projectId: issues.projectId }).from(issues).where(eq(issues.id, issueData.id)).limit(1);
    const projectId = issueRows2[0]?.projectId;
    if (projectId) {
      const ws = await db.select().from(projectWorkspaces).where(eq(projectWorkspaces.projectId, projectId)).limit(1);
      if (ws[0]?.cwd) workspaceCwd = ws[0].cwd;
    }
  }

  // Resolve skill directories based on agent role
  const agentRoleForSkills = await getAgentRole(db, agent.id);
  const skillDirs = getSkillDirsForRole(agentRoleForSkills);

  const adapterConfig: Record<string, unknown> = {
    ...((agent.adapterConfig as Record<string, unknown>) ?? {}),
    skillDirs,
  };

  // Inject workspace cwd into adapter config
  if (workspaceCwd) {
    adapterConfig['cwd'] = workspaceCwd;
  }

  const ctx: AdapterExecutionContext = {
    runId: run.id,
    agent: {
      id: agent.id,
      companyId: agent.companyId,
      name: agent.name,
      adapterType: agent.adapterType,
    },
    runtime: {
      sessionId: input.sessionId ?? null,
      sessionParams: input.sessionParams ?? null,
      taskKey: run.taskId ?? run.taskScope ?? 'default',
    },
    config: adapterConfig,
    context: contextSnapshot,
    onLog: (stream, chunk) => {
      // Fire-and-forget log event to DB
      void logRunEvent(db, run.id, run.companyId, 'log', {
        stream,
        chunk,
      });
      // Publish live log event (with chunking for large output)
      if (eventBus) {
        publishLogChunked(eventBus, run.companyId, run.id, stream, chunk);
      }
    },
    onSpawn: (info) => {
      // Track PID in running processes
      if (info.pid) {
        const existing = runningProcesses.get(run.id);
        if (existing) {
          existing.pid = info.pid;
        }
      }
    },
    authToken: input.authToken ?? '',
  };

  // 4. Track in running processes
  runningProcesses.set(run.id, {
    pid: null,
    runId: run.id,
    agentId: agent.id,
  });

  try {
    // 5. Execute
    const result = await adapter.execute(ctx);

    // 6. Determine terminal status
    const status = determineStatus(result);

    // 7. Complete run
    const completionInput: CompleteRunInput = {
      exitCode: result.exitCode,
      signal: result.signal,
      usage: result.usage,
      costUsd: result.costUsd,
      summary: result.summary,
      provider: result.provider,
      model: result.model,
      billingType: result.billingType,
      sessionId: result.sessionId,
      sessionParams: result.sessionParams,
    };

    const completed = await completeRun(db, run.id, status, completionInput);

    // 8. Update issue status based on run outcome (with Dev↔QA flow)
    if (issueData) {
      try {
        await releaseIssue(db, issueData.id);

        if (status === 'succeeded') {
          await handleSuccessfulIssueCompletion(
            db, issueData, agent, result.summary ?? '', run, eventBus,
          );
        } else {
          // Failed or timed out — revert to todo
          await db
            .update(issues)
            .set({ status: 'todo', updatedAt: new Date() })
            .where(eq(issues.id, issueData.id));
        }
      } catch (releaseErr) {
        console.error(`[executeRun] Failed to update issue ${issueData.id}:`, releaseErr);
      }
    }

    // 9. Publish run status → terminal
    eventBus?.publish({
      companyId: run.companyId,
      type: 'heartbeat.run.status',
      payload: {
        runId: run.id,
        agentId: agent.id,
        status,
        exitCode: result.exitCode,
        costUsd: result.costUsd,
        summary: result.summary,
      },
    });

    // 10. Update agent_runtime_state with session info
    if (result.sessionId || result.clearSession) {
      await updateRuntimeSession(db, agent.id, agent.companyId, result);
    }

    return completed;
  } catch (err) {
    // Adapter threw an error
    const errorMessage =
      err instanceof Error ? err.message : 'Unknown adapter error';

    const completed = await completeRun(db, run.id, 'failed', {
      exitCode: 1,
      summary: `Adapter error: ${errorMessage}`,
    });

    // Release issue lock and revert status on adapter error
    if (issueData) {
      try {
        await releaseIssue(db, issueData.id);
        await db
          .update(issues)
          .set({ status: 'todo', updatedAt: new Date() })
          .where(eq(issues.id, issueData.id));
      } catch (releaseErr) {
        console.error(`[executeRun] Failed to release issue ${issueData.id}:`, releaseErr);
      }
    }

    eventBus?.publish({
      companyId: run.companyId,
      type: 'heartbeat.run.status',
      payload: {
        runId: run.id,
        agentId: agent.id,
        status: 'failed',
        summary: `Adapter error: ${errorMessage}`,
      },
    });

    return completed;
  } finally {
    // 11. Reset agent status to idle only if no other active runs exist
    const otherActiveRuns = await db
      .select({ id: heartbeatRuns.id })
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.agentId, agent.id),
          ne(heartbeatRuns.id, run.id),
          inArray(heartbeatRuns.status, [...ACTIVE_RUN_STATUSES]),
        ),
      )
      .limit(1);

    if (otherActiveRuns.length === 0) {
      await db
        .update(agents)
        .set({ status: 'idle', updatedAt: new Date() })
        .where(eq(agents.id, agent.id));

      eventBus?.publish({
        companyId: run.companyId,
        type: 'agent.status',
        payload: {
          agentId: agent.id,
          status: 'idle',
        },
      });
    }

    // 12. Remove from running processes
    runningProcesses.delete(run.id);
  }
}

/**
 * Determine terminal run status from adapter result.
 */
export function determineStatus(
  result: Pick<AdapterExecutionResult, 'timedOut' | 'exitCode'>,
): 'succeeded' | 'failed' | 'timed_out' {
  if (result.timedOut) return 'timed_out';
  if (result.exitCode === 0) return 'succeeded';
  return 'failed';
}

/**
 * Update agent_runtime_state with session information.
 */
async function updateRuntimeSession(
  db: Db,
  agentId: string,
  companyId: string,
  result: AdapterExecutionResult,
): Promise<void> {
  const sessionId = result.clearSession ? null : result.sessionId;
  const sessionParams = result.clearSession ? null : result.sessionParams;

  // Upsert agent_runtime_state
  const existing = await db
    .select({ id: agentRuntimeState.id })
    .from(agentRuntimeState)
    .where(eq(agentRuntimeState.agentId, agentId));

  if (existing.length > 0) {
    await db
      .update(agentRuntimeState)
      .set({
        sessionId,
        sessionParams,
      })
      .where(eq(agentRuntimeState.agentId, agentId));
  } else {
    await db.insert(agentRuntimeState).values({
      agentId,
      companyId,
      sessionId,
      sessionParams,
    });
  }
}

// ── Dev ↔ QA collaboration helpers ──────────────────────────────────────────

/**
 * Get the role of an agent by ID.
 */
async function getAgentRole(db: Db, agentId: string): Promise<string> {
  const rows = await db
    .select({ role: agents.role })
    .from(agents)
    .where(eq(agents.id, agentId));
  return rows[0]?.role ?? 'general';
}

/**
 * Check if a company has at least one QA-role agent.
 */
async function companyHasQAAgent(db: Db, companyId: string): Promise<boolean> {
  const allAgents = await db
    .select({ role: agents.role })
    .from(agents)
    .where(eq(agents.companyId, companyId));
  return allAgents.some((a) => QA_ROLES.has(a.role));
}

/**
 * Get the most recent succeeded run summary for an issue (excluding current run).
 * Used to feed developer's work into QA prompt.
 */
async function getPreviousRunSummary(
  db: Db,
  issueId: string,
  currentRunId: string,
): Promise<string | null> {
  const rows = await db
    .select({ summary: heartbeatRuns.summary, agentId: heartbeatRuns.agentId })
    .from(heartbeatRuns)
    .where(
      and(
        eq(heartbeatRuns.taskId, issueId),
        eq(heartbeatRuns.status, 'succeeded'),
      ),
    )
    .orderBy(desc(heartbeatRuns.completedAt))
    .limit(5);

  // Find the most recent run that's not the current one
  const prev = rows.find((r) => r.agentId !== currentRunId);
  return prev?.summary ?? rows[0]?.summary ?? null;
}

/**
 * Get QA feedback (most recent QA run summary) for an issue.
 * Used when developer re-works after rejection.
 */
async function getQAFeedback(
  db: Db,
  issueId: string,
  _currentRunId: string,
): Promise<string | null> {
  // Find the most recent succeeded run by a QA agent for this issue
  const runs = await db
    .select({
      summary: heartbeatRuns.summary,
      agentId: heartbeatRuns.agentId,
    })
    .from(heartbeatRuns)
    .where(
      and(
        eq(heartbeatRuns.taskId, issueId),
        eq(heartbeatRuns.status, 'succeeded'),
      ),
    )
    .orderBy(desc(heartbeatRuns.completedAt))
    .limit(10);

  // Check each run's agent role to find a QA run
  for (const run of runs) {
    const role = await getAgentRole(db, run.agentId);
    if (QA_ROLES.has(role)) {
      return run.summary ?? null;
    }
  }
  return null;
}

/**
 * Build QA review prompt.
 */
function buildQAPrompt(
  issue: { title: string; description: string | null },
  previousSummary: string | null,
): string {
  const parts = [
    'You are a QA reviewer. Review the following work done by a developer agent.',
    '',
    `Task: ${issue.title}`,
    `Description: ${issue.description || 'No description'}`,
  ];

  if (previousSummary) {
    parts.push('', `Developer's work summary: ${previousSummary}`);
  }

  parts.push(
    '',
    'Review the work and respond with:',
    '- "APPROVED" if the work is satisfactory',
    '- "REJECTED: <reason>" if changes are needed',
  );

  return parts.join('\n');
}

/**
 * Build developer prompt, optionally including QA feedback and work product info.
 */
export function buildDeveloperPrompt(
  issue: { title: string; description: string | null },
  qaFeedback: string | null,
  workProductInfo?: { prUrl: string; branchName: string | null } | null,
): string {
  const parts = [
    `Task: ${issue.title}`,
    '',
    `Description: ${issue.description || 'No description'}`,
  ];

  if (qaFeedback) {
    parts.push(
      '',
      `Previous QA feedback: ${qaFeedback}`,
    );

    if (workProductInfo?.prUrl) {
      parts.push(
        '',
        `Existing PR: ${workProductInfo.prUrl}`,
      );
      if (workProductInfo.branchName) {
        parts.push(`Branch: ${workProductInfo.branchName}`);
      }
      parts.push(
        '',
        'IMPORTANT: Fix the issues on the existing branch. Do NOT create a new PR. Push your fixes to the same branch so the existing PR is updated.',
      );
    }

    parts.push(
      '',
      'Please address the feedback and complete the task.',
    );
  } else {
    parts.push('', 'Please complete this task.');
  }

  return parts.join('\n');
}

/**
 * Build plan review prompt for plan-reviewer agents.
 */
export function buildPlanReviewPrompt(
  issue: { title: string; description: string | null },
): string {
  return [
    '# Plan Review Request',
    '',
    `## Sub-Issue Title: ${issue.title}`,
    '',
    '## Sub-Issue Description:',
    issue.description || '(No description)',
    '',
    'Review this sub-issue for executability.',
    'Check: references exist, task is clear, acceptance criteria are verifiable.',
    'Respond with APPROVED or REJECTED: <reason>',
  ].join('\n');
}

/**
 * Handle successful issue completion with role-based Dev↔QA flow.
 *
 * - Developer roles: send to `in_review` (if QA agent exists), else `done`
 * - QA roles: parse approval → `done` or reject → `todo`
 * - Other roles: `done`
 */
async function handleSuccessfulIssueCompletion(
  db: Db,
  issueData: { id: string; title: string; description: string | null; status: string },
  agent: { id: string; companyId: string; name: string; adapterType: string },
  summary: string,
  run: { id: string; companyId: string },
  eventBus?: LiveEventBus,
): Promise<void> {
  const role = await getAgentRole(db, agent.id);
  const activity = activityService(db);

  if (DEVELOPER_ROLES.has(role)) {
    // Auto-register work products (PRs) from developer summary
    const issueRow = await db.select({ projectId: issues.projectId }).from(issues).where(eq(issues.id, issueData.id)).limit(1);
    const projectId = issueRow[0]?.projectId ?? null;
    await registerWorkProductFromSummary(db, issueData.id, agent.companyId, summary, run.id, projectId);

    // Check if company has a QA agent
    const hasQA = await companyHasQAAgent(db, agent.companyId);

    if (hasQA) {
      // Send to review
      await db
        .update(issues)
        .set({ status: 'in_review', updatedAt: new Date() })
        .where(eq(issues.id, issueData.id));

      await activity.log({
        companyId: run.companyId,
        actorType: 'agent',
        actorId: agent.id,
        action: 'agent.completed_work',
        entityType: 'issue',
        entityId: issueData.id,
        metadata: { agentName: agent.name, issueTitle: issueData.title },
      });

      await activity.log({
        companyId: run.companyId,
        actorType: 'system',
        action: 'issue.sent_to_review',
        entityType: 'issue',
        entityId: issueData.id,
        metadata: { issueTitle: issueData.title, developerAgent: agent.name },
      });

      eventBus?.publish({
        companyId: run.companyId,
        type: 'issue.status',
        payload: {
          issueId: issueData.id,
          status: 'in_review',
          reason: 'Developer completed work, sending to QA review',
        },
      });

      console.log(`[executeRun] Issue ${issueData.id} sent to review (developer: ${agent.name})`);
    } else {
      // No QA agent — complete as done (backward compatible)
      await db
        .update(issues)
        .set({ status: 'done', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(issues.id, issueData.id));

      // Generate and store completion report
      try {
        const report = await generateSimpleCompletionReport(db, issueData, summary);
        await storeCompletionReport(db, issueData.id, report);
      } catch (err) {
        console.error(`[executeRun] Failed to generate completion report for ${issueData.id}:`, err);
      }
    }
  } else if (QA_ROLES.has(role)) {
    // QA agent — parse approval from summary
    // Check rejection FIRST — prevents false positives when summary contains
    // words like "approved" in explanatory text after a REJECTED verdict
    const isRejected = REJECTION_PATTERNS.some((pattern) => pattern.test(summary));
    const isApproved = !isRejected && APPROVAL_PATTERNS.some((pattern) => pattern.test(summary));

    if (isApproved) {
      await db
        .update(issues)
        .set({ status: 'done', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(issues.id, issueData.id));

      // Mark open PRs as approved
      await updateWorkProductReviewState(db, issueData.id, 'approved');

      // Generate and store completion report
      try {
        const report = await generateSimpleCompletionReport(db, issueData, summary);
        await storeCompletionReport(db, issueData.id, report);
      } catch (err) {
        console.error(`[executeRun] Failed to generate completion report for ${issueData.id}:`, err);
      }

      await activity.log({
        companyId: run.companyId,
        actorType: 'agent',
        actorId: agent.id,
        action: 'qa.approved',
        entityType: 'issue',
        entityId: issueData.id,
        metadata: { agentName: agent.name, issueTitle: issueData.title, summary },
      });

      eventBus?.publish({
        companyId: run.companyId,
        type: 'issue.status',
        payload: {
          issueId: issueData.id,
          status: 'done',
          reason: `QA approved by ${agent.name}`,
        },
      });

      console.log(`[executeRun] Issue ${issueData.id} approved by QA agent ${agent.name}`);
    } else {
      // Rejected — send back to developer
      await db
        .update(issues)
        .set({ status: 'todo', updatedAt: new Date() })
        .where(eq(issues.id, issueData.id));

      // Mark open PRs as changes_requested (keep PRs open)
      await updateWorkProductReviewState(db, issueData.id, 'changes_requested');

      await activity.log({
        companyId: run.companyId,
        actorType: 'agent',
        actorId: agent.id,
        action: 'qa.rejected',
        entityType: 'issue',
        entityId: issueData.id,
        metadata: { agentName: agent.name, issueTitle: issueData.title, summary },
      });

      eventBus?.publish({
        companyId: run.companyId,
        type: 'issue.status',
        payload: {
          issueId: issueData.id,
          status: 'todo',
          reason: `QA rejected by ${agent.name}: ${summary}`,
        },
      });

      console.log(`[executeRun] Issue ${issueData.id} rejected by QA agent ${agent.name}`);
    }
  } else if (PLAN_REVIEW_ROLES.has(role)) {
    // Plan reviewer — parse approval/rejection, then transition issue status
    const isRejected = REJECTION_PATTERNS.some((pattern) => pattern.test(summary));
    const isApproved = !isRejected && APPROVAL_PATTERNS.some((pattern) => pattern.test(summary));

    if (isApproved) {
      // plan_review → todo (developer can now pick it up)
      await db
        .update(issues)
        .set({ status: 'todo', updatedAt: new Date() })
        .where(eq(issues.id, issueData.id));

      await activity.log({
        companyId: run.companyId,
        actorType: 'agent',
        actorId: agent.id,
        action: 'plan_review.approved',
        entityType: 'issue',
        entityId: issueData.id,
        metadata: { agentName: agent.name, issueTitle: issueData.title, summary },
      });

      eventBus?.publish({
        companyId: run.companyId,
        type: 'issue.status',
        payload: {
          issueId: issueData.id,
          status: 'todo',
          reason: `Plan approved by ${agent.name}`,
        },
      });

      console.log(`[executeRun] Issue ${issueData.id} plan approved by ${agent.name}`);
    } else {
      // plan_review → backlog (PM can revisit)
      await db
        .update(issues)
        .set({ status: 'backlog', updatedAt: new Date() })
        .where(eq(issues.id, issueData.id));

      await activity.log({
        companyId: run.companyId,
        actorType: 'agent',
        actorId: agent.id,
        action: 'plan_review.rejected',
        entityType: 'issue',
        entityId: issueData.id,
        metadata: { agentName: agent.name, issueTitle: issueData.title, summary },
      });

      eventBus?.publish({
        companyId: run.companyId,
        type: 'issue.status',
        payload: {
          issueId: issueData.id,
          status: 'backlog',
          reason: `Plan rejected by ${agent.name}: ${summary}`,
        },
      });

      console.log(`[executeRun] Issue ${issueData.id} plan rejected by ${agent.name}`);
    }
  } else if (role === 'pm') {
    // PM agent — parse response as plan or review
    await handlePMCompletion(db, issueData, agent, summary, run, eventBus);
  } else {
    // Other roles — complete as done (backward compatible)
    await db
      .update(issues)
      .set({ status: 'done', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(issues.id, issueData.id));

    // Generate and store completion report
    try {
      const report = await generateSimpleCompletionReport(db, issueData, summary);
      await storeCompletionReport(db, issueData.id, report);
    } catch (err) {
      console.error(`[executeRun] Failed to generate completion report for ${issueData.id}:`, err);
    }
  }
}

// ── PM orchestration helpers ──────────────────────────────────────────

/**
 * Build PM prompt — either initial task analysis or review phase.
 */
async function buildPMPrompt(
  db: Db,
  issue: { id: string; title: string; description: string | null },
): Promise<string> {
  // Check if sub-issues already exist (review phase)
  const subStatus = await checkSubIssuesComplete(db, issue.id);

  if (subStatus.total > 0 && subStatus.allDone) {
    // Review phase — all sub-issues complete
    const summaries = await getSubIssueSummaries(db, issue.id);
    const parts = [
      'You are reviewing completed sub-tasks for the following task.',
      '',
      `Task: ${issue.title}`,
      `Description: ${issue.description || 'No description'}`,
      '',
      `All ${subStatus.total} sub-tasks are complete. Review results:`,
      '',
    ];

    for (const s of summaries) {
      parts.push(`### ${s.title} [${s.status}]`);
      parts.push(s.summary || 'No summary available.');
      parts.push('');
    }

    parts.push(
      'Review the work and output your decision as JSON:',
      '- If satisfactory: {"review": "...", "decision": "APPROVED", "feedback": "..."}',
      '- If changes needed: {"review": "...", "decision": "NEEDS_CHANGES", "feedback": "...", "reopen": ["sub-task title"]}',
    );

    return parts.join('\n');
  }

  // Initial analysis phase — detailed prompt for high-quality sub-issue creation
  const parts = [
    `Task: ${issue.title}`,
    '',
    `Description: ${issue.description || 'No description'}`,
    '',
    '## Instructions',
    '',
    'You are a PM agent. Analyze this task and create a detailed execution plan.',
    '',
    '### Step 1: Codebase Research (MANDATORY)',
    'Before creating sub-tasks, research the codebase:',
    '- Find the files that will need to be modified',
    '- Identify existing patterns to follow',
    '- Check what tests exist for related code',
    '',
    '### Step 2: Create Sub-Tasks',
    'Output your plan as a JSON block. Each subtask description MUST be detailed (minimum 200 characters).',
    '',
    'REQUIRED JSON structure:',
    '```json',
    '{',
    '  "analysis": "Your analysis of the task and codebase research findings",',
    '  "subtasks": [',
    '    {',
    '      "title": "Concise task title",',
    '      "description": "DETAILED description with ALL of the following sections:\\n\\n## 1. TASK\\n[Exact what to implement]\\n\\n## 2. EXPECTED OUTCOME\\n- Files to modify: [exact paths]\\n- Functionality: [exact behavior]\\n\\n## 3. IMPLEMENTATION APPROACH\\n- Follow pattern in [file:lines]\\n- [Step-by-step guidance]\\n\\n## 4. MUST DO\\n- [Required items]\\n\\n## 5. MUST NOT DO\\n- [Forbidden items]\\n\\n## 6. REFERENCES\\n- [file:lines] — [why relevant]",',
    '      "role": "engineer",',
    '      "priority": "medium"',
    '    }',
    '  ],',
    '  "notes": "Additional context or decisions made"',
    '}',
    '```',
    '',
    '### CRITICAL RULES for sub-task descriptions:',
    '- Each description MUST contain all 6 sections (TASK, EXPECTED OUTCOME, IMPLEMENTATION APPROACH, MUST DO, MUST NOT DO, REFERENCES)',
    '- Each description MUST be at least 200 characters',
    '- REFERENCES must include actual file paths from your codebase research',
    '- MUST NOT DO must include "Do NOT modify files outside scope" and "Do NOT skip verification (pnpm build && pnpm lint && pnpm test:unit)"',
    '- A vague one-line description is UNACCEPTABLE and will be rejected by the plan reviewer',
  ];

  return parts.join('\n');
}

/**
 * Handle PM agent completion — create sub-issues or process review.
 */
async function handlePMCompletion(
  db: Db,
  issueData: { id: string; title: string; description: string | null; status: string },
  agent: { id: string; companyId: string; name: string; adapterType: string },
  summary: string,
  run: { id: string; companyId: string },
  eventBus?: LiveEventBus,
): Promise<void> {
  const activity = activityService(db);

  // Check if sub-issues already exist (this is a review phase)
  const subStatus = await checkSubIssuesComplete(db, issueData.id);

  if (subStatus.total > 0 && subStatus.allDone) {
    // Review phase — all sub-issues are done, PM reviews the results
    const review = parsePMReview(summary);

    if (review) {
      await handlePMReviewDecision(db, issueData.id, run.companyId, review);

      const action = review.decision === 'APPROVED' ? 'pm.approved' : 'pm.requested_changes';
      await activity.log({
        companyId: run.companyId,
        actorType: 'agent',
        actorId: agent.id,
        action,
        entityType: 'issue',
        entityId: issueData.id,
        metadata: {
          agentName: agent.name,
          issueTitle: issueData.title,
          decision: review.decision,
          feedback: review.feedback,
        },
      });

      const status = review.decision === 'APPROVED' ? 'done' : 'in_progress';
      eventBus?.publish({
        companyId: run.companyId,
        type: 'issue.status',
        payload: {
          issueId: issueData.id,
          status,
          reason: `PM ${review.decision === 'APPROVED' ? 'approved' : 'requested changes'}`,
        },
      });

      console.log(`[executeRun] PM review for issue ${issueData.id}: ${review.decision}`);
    } else {
      // Could not parse review — block for human review instead of silently approving
      await db
        .update(issues)
        .set({ status: 'blocked', updatedAt: new Date() })
        .where(eq(issues.id, issueData.id));

      await activity.log({
        companyId: run.companyId,
        actorType: 'system',
        action: 'pm.parse_failed',
        entityType: 'issue',
        entityId: issueData.id,
        metadata: {
          phase: 'review',
          rawSummary: summary?.slice(0, 500),
          message: 'PM review response could not be parsed — issue blocked for human review',
        },
      });

      console.log(`[executeRun] PM review parse failed for issue ${issueData.id}, marking blocked`);
    }
    return;
  }

  if (subStatus.total > 0 && !subStatus.allDone) {
    // Sub-issues exist but not all done — PM was woken up prematurely, just keep in_progress
    console.log(`[executeRun] PM woken for issue ${issueData.id} but sub-issues not all done (${subStatus.completed}/${subStatus.total}). Keeping in_progress.`);
    await db
      .update(issues)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(eq(issues.id, issueData.id));
    return;
  }

  // Initial phase — parse as PMPlan
  const plan = parsePMResponse(summary);

  if (plan && plan.subtasks.length > 0) {
    // Create sub-issues
    const subIssueIds = await createSubIssues(db, issueData.id, run.companyId, plan);

    // Set parent issue to in_progress (waiting for sub-tasks)
    await db
      .update(issues)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(eq(issues.id, issueData.id));

    await activity.log({
      companyId: run.companyId,
      actorType: 'agent',
      actorId: agent.id,
      action: 'pm.created_subtasks',
      entityType: 'issue',
      entityId: issueData.id,
      metadata: {
        agentName: agent.name,
        issueTitle: issueData.title,
        subtaskCount: subIssueIds.length,
        analysis: plan.analysis,
      },
    });

    eventBus?.publish({
      companyId: run.companyId,
      type: 'issue.status',
      payload: {
        issueId: issueData.id,
        status: 'in_progress',
        reason: `PM created ${subIssueIds.length} sub-tasks`,
      },
    });

    console.log(`[executeRun] PM created ${subIssueIds.length} sub-tasks for issue ${issueData.id}`);
  } else {
    // No valid plan — block for human review instead of silently approving
    await db
      .update(issues)
      .set({ status: 'blocked', updatedAt: new Date() })
      .where(eq(issues.id, issueData.id));

    await activity.log({
      companyId: run.companyId,
      actorType: 'system',
      action: 'pm.parse_failed',
      entityType: 'issue',
      entityId: issueData.id,
      metadata: {
        phase: 'plan',
        rawSummary: summary?.slice(0, 500),
        message: 'PM response could not be parsed — issue blocked for human review',
      },
    });

    console.log(`[executeRun] PM produced no plan for issue ${issueData.id}, marking blocked`);
  }
}
