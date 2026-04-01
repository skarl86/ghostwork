/**
 * Context Snapshot — builds GHOSTWORK_* environment variables for agent processes.
 */

export interface ContextSnapshotInput {
  agentId: string;
  companyId: string;
  apiUrl: string;
  runId: string;
  taskId?: string | null;
  wakeReason?: string | null;
  apiKey?: string | null;
  linkedIssueIds?: string[] | null;
  approvalId?: string | null;
  approvalStatus?: string | null;
  issueId?: string | null;
  issueTitle?: string | null;
  issueDescription?: string | null;
}

/**
 * Build a record of GHOSTWORK_* environment variables from the given input.
 */
export function buildContextSnapshot(
  input: ContextSnapshotInput,
): Record<string, string> {
  const env: Record<string, string> = {
    GHOSTWORK_AGENT_ID: input.agentId,
    GHOSTWORK_COMPANY_ID: input.companyId,
    GHOSTWORK_API_URL: input.apiUrl,
    GHOSTWORK_RUN_ID: input.runId,
  };

  if (input.taskId) env['GHOSTWORK_TASK_ID'] = input.taskId;
  if (input.wakeReason) env['GHOSTWORK_WAKE_REASON'] = input.wakeReason;
  if (input.apiKey) env['GHOSTWORK_API_KEY'] = input.apiKey;
  if (input.approvalId) env['GHOSTWORK_APPROVAL_ID'] = input.approvalId;
  if (input.approvalStatus) env['GHOSTWORK_APPROVAL_STATUS'] = input.approvalStatus;

  if (input.linkedIssueIds && input.linkedIssueIds.length > 0) {
    env['GHOSTWORK_LINKED_ISSUE_IDS'] = input.linkedIssueIds.join(',');
  }

  if (input.issueId) env['GHOSTWORK_ISSUE_ID'] = input.issueId;
  if (input.issueTitle) env['GHOSTWORK_ISSUE_TITLE'] = input.issueTitle;
  if (input.issueTitle) {
    const prompt = `Task: ${input.issueTitle}\n\nDescription: ${input.issueDescription || 'No description'}\n\nPlease complete this task.`;
    env['GHOSTWORK_TASK_PROMPT'] = prompt;
  }

  return env;
}
