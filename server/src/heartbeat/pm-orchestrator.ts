/**
 * PM Orchestrator — Parse PM agent responses and manage sub-issue lifecycle.
 *
 * Responsibilities:
 * 1. Parse structured JSON plans from PM agent output
 * 2. Create sub-issues from the plan
 * 3. Monitor sub-issue completion and trigger PM review
 */

import { eq, and, desc } from 'drizzle-orm';
import { issues, agents, heartbeatRuns } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { activityService } from '../services/activity.js';

// ── Constants ──

/** Maximum number of PM review cycles before auto-approving to prevent infinite loops */
export const MAX_REVIEW_CYCLES = 3;

// ── Types ──

export interface PMPlan {
  analysis: string | Record<string, unknown>;
  subtasks: Array<{
    title: string;
    description?: string;
    role?: string;
    priority?: string;
    [key: string]: unknown; // allow extra fields from LLM
  }>;
  notes?: string;
}

export interface PMReview {
  review: string;
  decision: 'APPROVED' | 'NEEDS_CHANGES';
  feedback?: string;
  reopen?: string[];
}

export interface SubIssueStatus {
  allDone: boolean;
  total: number;
  completed: number;
}

// ── PM Response Parsing ──

/**
 * Extract JSON from PM agent's output.
 * Handles: markdown code blocks (```json ... ```), raw JSON, mixed text+JSON.
 */
export function parsePMResponse(summary: string): PMPlan | null {
  if (!summary || summary.trim().length === 0) return null;

  // Strategy 1: Extract from markdown code block
  const codeBlockMatch = summary.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    const parsed = tryParseJSON(codeBlockMatch[1]!);
    if (parsed && isPMPlan(parsed)) return parsed;
  }

  // Strategy 2: Find first { ... } JSON object in the text
  const jsonMatch = extractOutermostJSON(summary);
  if (jsonMatch) {
    const parsed = tryParseJSON(jsonMatch);
    if (parsed && isPMPlan(parsed)) return parsed;
  }

  // Strategy 3: Try the entire string as JSON
  const parsed = tryParseJSON(summary.trim());
  if (parsed && isPMPlan(parsed)) return parsed;

  return null;
}

/**
 * Parse PM review response.
 */
export function parsePMReview(summary: string): PMReview | null {
  if (!summary || summary.trim().length === 0) return null;

  const codeBlockMatch = summary.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    const parsed = tryParseJSON(codeBlockMatch[1]!);
    if (parsed && isPMReview(parsed)) return parsed;
  }

  const jsonMatch = extractOutermostJSON(summary);
  if (jsonMatch) {
    const parsed = tryParseJSON(jsonMatch);
    if (parsed && isPMReview(parsed)) return parsed;
  }

  const parsed = tryParseJSON(summary.trim());
  if (parsed && isPMReview(parsed)) return parsed;

  return null;
}

function tryParseJSON(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function extractOutermostJSON(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

export function isPMPlan(obj: unknown): obj is PMPlan {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    (typeof o['analysis'] === 'string' || (typeof o['analysis'] === 'object' && o['analysis'] !== null)) &&
    Array.isArray(o['subtasks']) &&
    o['subtasks'].length > 0 &&
    o['subtasks'].every(
      (s: unknown) =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as Record<string, unknown>)['title'] === 'string',
      // role is optional — defaults to 'engineer' in createSubIssues
    )
  );
}

export function isPMReview(obj: unknown): obj is PMReview {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o['review'] === 'string' &&
    (o['decision'] === 'APPROVED' || o['decision'] === 'NEEDS_CHANGES')
  );
}

// ── Sub-issue Creation ──

/**
 * Create sub-issues from a PM plan.
 * Each sub-issue gets parentId = parent issue, assignee matched by role.
 */
export async function createSubIssues(
  db: Db,
  parentIssueId: string,
  companyId: string,
  plan: PMPlan,
): Promise<string[]> {
  // Find all agents in the company for role matching
  const companyAgents = await db
    .select({ id: agents.id, role: agents.role, status: agents.status })
    .from(agents)
    .where(eq(agents.companyId, companyId));

  const createdIds: string[] = [];

  for (const subtask of plan.subtasks) {
    // Find best agent for the role
    const matchingAgent = findAgentForRole(companyAgents, subtask.role ?? 'engineer');

    const rows = await db
      .insert(issues)
      .values({
        companyId,
        parentId: parentIssueId,
        title: subtask.title,
        description: subtask.description || null,
        status: 'todo',
        priority: normalizePriority(subtask.priority ?? 'medium'),
        assigneeAgentId: matchingAgent?.id ?? null,
        originKind: 'pm_subtask',
      })
      .returning();

    const row = rows[0];
    if (row) {
      createdIds.push(row.id);
    }
  }

  // Log activity
  await activityService(db).log({
    companyId,
    actorType: 'system',
    action: 'pm.created_subtasks',
    entityType: 'issue',
    entityId: parentIssueId,
    metadata: {
      subtaskCount: createdIds.length,
      analysis: plan.analysis,
      notes: plan.notes,
    },
  });

  return createdIds;
}

/**
 * Find the best agent for a given role in a list of company agents.
 * Prefers idle agents, falls back to any active agent with matching role.
 */
function findAgentForRole(
  companyAgents: Array<{ id: string; role: string; status: string }>,
  targetRole: string,
): { id: string } | null {
  // Normalize role aliases
  const roleAliases: Record<string, string[]> = {
    engineer: ['engineer', 'developer'],
    qa: ['qa', 'reviewer', '리뷰어'],
    designer: ['designer'],
    pm: ['pm'],
  };

  const acceptableRoles = roleAliases[targetRole] ?? [targetRole];

  const matching = companyAgents.filter(
    (a) => acceptableRoles.includes(a.role) && a.status !== 'terminated',
  );

  if (matching.length === 0) return null;

  // Prefer idle agents
  const idle = matching.find((a) => a.status === 'idle');
  return idle ?? matching[0]!;
}

function normalizePriority(priority: string): string {
  const valid = ['low', 'medium', 'high', 'urgent'];
  return valid.includes(priority) ? priority : 'medium';
}

// ── Completion Report ──

export interface CompletionReport {
  issueTitle: string;
  completedAt: string;
  summary: string;
  subtasks: Array<{
    title: string;
    status: string;
    assignee: string;
    summary: string;
  }>;
  totalRuns: number;
  totalCost: number;
}

/**
 * Generate a completion report for a parent issue with sub-issues.
 */
export async function generateCompletionReport(
  db: Db,
  parentIssue: { id: string; title: string },
  reviewSummary: string,
): Promise<CompletionReport> {
  // Get all sub-issues
  const subIssues = await db
    .select({
      id: issues.id,
      title: issues.title,
      status: issues.status,
      assigneeAgentId: issues.assigneeAgentId,
    })
    .from(issues)
    .where(eq(issues.parentId, parentIssue.id));

  const subtasks: CompletionReport['subtasks'] = [];
  let totalRuns = 0;
  let totalCost = 0;

  for (const sub of subIssues) {
    // Get agent name
    let assigneeName = 'Unassigned';
    if (sub.assigneeAgentId) {
      const agentRows = await db
        .select({ name: agents.name })
        .from(agents)
        .where(eq(agents.id, sub.assigneeAgentId));
      assigneeName = agentRows[0]?.name ?? sub.assigneeAgentId.slice(0, 8);
    }

    // Get runs for this sub-issue
    const runs = await db
      .select({
        summary: heartbeatRuns.summary,
        costUsd: heartbeatRuns.costUsd,
        status: heartbeatRuns.status,
      })
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.taskId, sub.id))
      .orderBy(desc(heartbeatRuns.completedAt));

    totalRuns += runs.length;
    for (const r of runs) {
      if (r.costUsd) totalCost += parseFloat(r.costUsd);
    }

    // Use the latest succeeded run summary
    const latestSucceeded = runs.find((r) => r.status === 'succeeded');

    subtasks.push({
      title: sub.title,
      status: sub.status,
      assignee: assigneeName,
      summary: latestSucceeded?.summary ?? 'No summary available',
    });
  }

  // Also count runs on the parent issue itself (PM runs)
  const parentRuns = await db
    .select({ costUsd: heartbeatRuns.costUsd })
    .from(heartbeatRuns)
    .where(eq(heartbeatRuns.taskId, parentIssue.id));

  totalRuns += parentRuns.length;
  for (const r of parentRuns) {
    if (r.costUsd) totalCost += parseFloat(r.costUsd);
  }

  return {
    issueTitle: parentIssue.title,
    completedAt: new Date().toISOString(),
    summary: reviewSummary,
    subtasks,
    totalRuns,
    totalCost: Math.round(totalCost * 10000) / 10000,
  };
}

/**
 * Generate a simple completion report for a non-PM issue (no sub-issues).
 */
export async function generateSimpleCompletionReport(
  db: Db,
  issue: { id: string; title: string },
  runSummary: string,
): Promise<CompletionReport> {
  const runs = await db
    .select({ costUsd: heartbeatRuns.costUsd })
    .from(heartbeatRuns)
    .where(eq(heartbeatRuns.taskId, issue.id));

  let totalCost = 0;
  for (const r of runs) {
    if (r.costUsd) totalCost += parseFloat(r.costUsd);
  }

  return {
    issueTitle: issue.title,
    completedAt: new Date().toISOString(),
    summary: runSummary,
    subtasks: [],
    totalRuns: runs.length,
    totalCost: Math.round(totalCost * 10000) / 10000,
  };
}

/**
 * Store a completion report in the issue's executionWorkspaceSettings JSONB field.
 */
export async function storeCompletionReport(
  db: Db,
  issueId: string,
  report: CompletionReport,
): Promise<void> {
  // Get existing settings
  const rows = await db
    .select({ settings: issues.executionWorkspaceSettings })
    .from(issues)
    .where(eq(issues.id, issueId));

  const existing = (rows[0]?.settings as Record<string, unknown>) ?? {};

  await db
    .update(issues)
    .set({
      executionWorkspaceSettings: { ...existing, completionReport: report },
      updatedAt: new Date(),
    })
    .where(eq(issues.id, issueId));
}

// ── Sub-issue Status Checking ──

/**
 * Check if all sub-issues of a parent are done.
 */
export async function checkSubIssuesComplete(
  db: Db,
  parentIssueId: string,
): Promise<SubIssueStatus> {
  const subIssues = await db
    .select({ id: issues.id, status: issues.status })
    .from(issues)
    .where(eq(issues.parentId, parentIssueId));

  const total = subIssues.length;
  const completed = subIssues.filter((i) => i.status === 'done').length;

  return {
    allDone: total > 0 && completed === total,
    total,
    completed,
  };
}

/**
 * Get sub-issue summaries for PM review context.
 * Collects latest succeeded run summaries for each sub-issue.
 */
export async function getSubIssueSummaries(
  db: Db,
  parentIssueId: string,
): Promise<Array<{ title: string; status: string; summary: string | null }>> {
  const subIssues = await db
    .select({ id: issues.id, title: issues.title, status: issues.status })
    .from(issues)
    .where(eq(issues.parentId, parentIssueId));

  const results: Array<{ title: string; status: string; summary: string | null }> = [];

  for (const sub of subIssues) {
    // Get the latest succeeded run for this sub-issue
    const runs = await db
      .select({ summary: heartbeatRuns.summary })
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.taskId, sub.id),
          eq(heartbeatRuns.status, 'succeeded'),
        ),
      )
      .orderBy(desc(heartbeatRuns.completedAt))
      .limit(1);

    results.push({
      title: sub.title,
      status: sub.status,
      summary: runs[0]?.summary ?? null,
    });
  }

  return results;
}

/**
 * Count how many times the PM has already reviewed this parent issue
 * (count succeeded runs where taskId = parentIssueId and agent role = pm).
 */
export async function getPMReviewCycleCount(
  db: Db,
  parentIssueId: string,
): Promise<number> {
  // Find all PM agents
  const pmAgents = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.role, 'pm'));

  const pmAgentIds = new Set(pmAgents.map((a) => a.id));
  if (pmAgentIds.size === 0) return 0;

  // Count succeeded runs for this parent issue by PM agents
  const runs = await db
    .select({ id: heartbeatRuns.id, agentId: heartbeatRuns.agentId })
    .from(heartbeatRuns)
    .where(
      and(
        eq(heartbeatRuns.taskId, parentIssueId),
        eq(heartbeatRuns.status, 'succeeded'),
      ),
    );

  return runs.filter((r) => pmAgentIds.has(r.agentId)).length;
}

/**
 * Handle PM review decision — approve or request changes.
 * Includes infinite loop defense: if review cycles >= MAX_REVIEW_CYCLES,
 * force approve even if the decision is NEEDS_CHANGES.
 */
export async function handlePMReviewDecision(
  db: Db,
  parentIssueId: string,
  companyId: string,
  review: PMReview,
): Promise<void> {
  // Infinite loop defense: check cycle count
  const cycleCount = await getPMReviewCycleCount(db, parentIssueId);

  // Helper to get parent issue title
  const parentRows = await db
    .select({ title: issues.title })
    .from(issues)
    .where(eq(issues.id, parentIssueId));
  const parentTitle = parentRows[0]?.title ?? 'Unknown';

  if (review.decision === 'NEEDS_CHANGES' && cycleCount >= MAX_REVIEW_CYCLES) {
    // Force approve to break infinite loop
    await db
      .update(issues)
      .set({ status: 'done', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(issues.id, parentIssueId));

    // Generate and store completion report
    try {
      const report = await generateCompletionReport(
        db,
        { id: parentIssueId, title: parentTitle },
        `Auto-approved after ${cycleCount} review cycles. ${review.review}`,
      );
      await storeCompletionReport(db, parentIssueId, report);
    } catch (err) {
      console.error(`[pm-orchestrator] Failed to generate completion report for ${parentIssueId}:`, err);
    }

    await activityService(db).log({
      companyId,
      actorType: 'system',
      action: 'pm.auto_approved',
      entityType: 'issue',
      entityId: parentIssueId,
      metadata: {
        review: review.review,
        feedback: review.feedback,
        cycleCount,
        reason: `Auto-approved after ${cycleCount} review cycles`,
      },
    });

    console.log(
      `[pm-orchestrator] Auto-approved issue ${parentIssueId} after ${cycleCount} review cycles (max: ${MAX_REVIEW_CYCLES})`,
    );
    return;
  }

  if (review.decision === 'APPROVED') {
    // Mark parent issue as done
    await db
      .update(issues)
      .set({ status: 'done', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(issues.id, parentIssueId));

    // Generate and store completion report
    try {
      const report = await generateCompletionReport(
        db,
        { id: parentIssueId, title: parentTitle },
        review.review,
      );
      await storeCompletionReport(db, parentIssueId, report);
    } catch (err) {
      console.error(`[pm-orchestrator] Failed to generate completion report for ${parentIssueId}:`, err);
    }

    await activityService(db).log({
      companyId,
      actorType: 'system',
      action: 'pm.approved',
      entityType: 'issue',
      entityId: parentIssueId,
      metadata: { review: review.review, feedback: review.feedback },
    });
  } else {
    // NEEDS_CHANGES — reopen specified sub-issues
    const subIssues = await db
      .select({ id: issues.id, title: issues.title })
      .from(issues)
      .where(eq(issues.parentId, parentIssueId));

    const reopenTitles = review.reopen ?? [];

    for (const sub of subIssues) {
      // Reopen if title matches, or reopen all if no specific titles given
      const shouldReopen =
        reopenTitles.length === 0 ||
        reopenTitles.some((t) => sub.title.toLowerCase().includes(t.toLowerCase()));

      if (shouldReopen) {
        await db
          .update(issues)
          .set({ status: 'todo', updatedAt: new Date() })
          .where(eq(issues.id, sub.id));
      }
    }

    // Keep parent in_progress (still waiting for sub-tasks)
    await db
      .update(issues)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(eq(issues.id, parentIssueId));

    await activityService(db).log({
      companyId,
      actorType: 'system',
      action: 'pm.requested_changes',
      entityType: 'issue',
      entityId: parentIssueId,
      metadata: {
        review: review.review,
        feedback: review.feedback,
        reopenedSubtasks: reopenTitles,
      },
    });
  }
}
