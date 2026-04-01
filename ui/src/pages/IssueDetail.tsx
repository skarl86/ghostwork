import { useParams, Link } from 'react-router';
import { ArrowLeft, CheckCircle, XCircle, Clock, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RunTranscriptView } from '@/components/RunTranscript';
import { Progress } from '@/components/ui/progress';
import { useCompanyContext } from '@/providers/CompanyProvider';
import { useIssue, useRuns, useAgents, useUpdateIssue, useSubIssues, useIssueReport, useRejectIssue } from '@/hooks/queries';
import { useQuery } from '@tanstack/react-query';
import type { IssueStatus, Agent } from '@/lib/api';
import { fetchProjectWorkspace } from '@/lib/api';
import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

/** Role sets matching server-side constants */
const QA_ROLES = new Set(['qa', 'reviewer', '리뷰어']);
const DEVELOPER_ROLES = new Set(['engineer', 'developer', 'general']);

/** Human-readable status labels for the review flow */
const STATUS_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  in_review: { label: 'Awaiting QA Review', icon: <Eye className="h-4 w-4" />, color: 'text-yellow-600' },
  done: { label: 'Completed', icon: <CheckCircle className="h-4 w-4" />, color: 'text-green-600' },
  todo: { label: 'To Do', icon: <Clock className="h-4 w-4" />, color: 'text-blue-600' },
  in_progress: { label: 'In Progress', icon: <Clock className="h-4 w-4" />, color: 'text-blue-600' },
};

const STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled'] as const;

const priorityVariant: Record<string, 'default' | 'destructive' | 'warning' | 'info' | 'secondary'> = {
  urgent: 'destructive',
  high: 'warning',
  medium: 'info',
  low: 'secondary',
};

export function IssueDetail() {
  const { companyId } = useCompanyContext();
  const { issueId } = useParams<{ issueId: string }>();
  const { data: issue, isLoading } = useIssue(issueId ?? '');
  const { data: runs } = useRuns(companyId);
  const { data: agentsList } = useAgents(companyId);
  const { data: subIssues } = useSubIssues(issueId ?? '');
  const updateMutation = useUpdateIssue();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Fetch workspace for the issue's project
  const { data: workspace } = useQuery({
    queryKey: ['project-workspace', issue?.projectId],
    queryFn: () => fetchProjectWorkspace(issue!.projectId!),
    enabled: !!issue?.projectId,
  });

  // Build agent lookup map
  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    agentsList?.forEach((a) => map.set(a.id, a));
    return map;
  }, [agentsList]);

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading issue...</div>;
  if (!issue) return <div className="p-6 text-muted-foreground">Issue not found.</div>;

  // Filter runs related to this issue
  const issueRuns = runs?.filter((r) => r.taskId === issueId) ?? [];

  /** Get a human-readable role label for a run based on agent role */
  function getRunRoleLabel(agentId: string): string {
    const agent = agentMap.get(agentId);
    const role = agent?.role ?? 'general';
    if (QA_ROLES.has(role)) return 'QA Review';
    if (DEVELOPER_ROLES.has(role)) return 'Developer Run';
    return 'Run';
  }

  /** Compute review flow status context */
  const reviewStatus = (() => {
    if (!issue) return null;
    if (issue.status === 'in_review') {
      return { label: 'Awaiting QA Review', description: 'Developer completed work. Waiting for QA agent review.' };
    }
    // Check if the last run was a QA rejection (issue back to todo with a QA run)
    const lastRun = issueRuns[0]; // runs are typically newest first
    if (lastRun && issue.status === 'todo') {
      const lastAgent = agentMap.get(lastRun.agentId);
      if (lastAgent && QA_ROLES.has(lastAgent.role ?? 'general') && lastRun.status === 'succeeded') {
        return { label: 'Rejected — Back to Developer', description: `QA rejected: ${lastRun.summary ?? 'No details'}` };
      }
    }
    return null;
  })();

  const handleStatusChange = (newStatus: string) => {
    updateMutation.mutate({ issueId: issue.id, data: { status: newStatus as IssueStatus } });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/${companyId}/issues`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{issue.title}</h1>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{issue.description ?? 'No description.'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Properties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="text-sm text-muted-foreground block mb-1">Status</span>
              <Select value={issue.status} onValueChange={handleStatusChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="text-sm text-muted-foreground block mb-1">Priority</span>
              <Badge variant={priorityVariant[issue.priority] ?? 'secondary'}>{issue.priority}</Badge>
            </div>
            <div>
              <span className="text-sm text-muted-foreground block mb-1">Assignee</span>
              <span className="text-sm">{issue.assigneeAgentId ? issue.assigneeAgentId.slice(0, 8) : 'Unassigned'}</span>
            </div>
            <div>
              <span className="text-sm text-muted-foreground block mb-1">Created</span>
              <span className="text-sm">{new Date(issue.createdAt).toLocaleString()}</span>
            </div>
            {workspace?.cwd && (
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Workspace</span>
                <span className="text-sm font-mono">{workspace.cwd}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {reviewStatus && (
        <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              {issue.status === 'in_review' ? (
                <Eye className="h-5 w-5 text-yellow-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <div>
                <p className="font-semibold text-sm">{reviewStatus.label}</p>
                <p className="text-xs text-muted-foreground">{reviewStatus.description}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {subIssues && subIssues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Sub-tasks</span>
              <span className="text-sm font-normal text-muted-foreground">
                {subIssues.filter((s) => s.status === 'done').length}/{subIssues.length} completed
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress
              value={(subIssues.filter((s) => s.status === 'done').length / subIssues.length) * 100}
              className="h-2"
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Assignee</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subIssues.map((sub) => {
                  const agentName = sub.assigneeAgentId
                    ? (agentMap.get(sub.assigneeAgentId)?.name ?? sub.assigneeAgentId.slice(0, 8))
                    : 'Unassigned';
                  return (
                    <TableRow key={sub.id}>
                      <TableCell>
                        <Link
                          to={`/${companyId}/issues/${sub.id}`}
                          className="font-medium text-sm hover:underline"
                        >
                          ↳ {sub.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            sub.status === 'done'
                              ? 'success'
                              : sub.status === 'in_progress'
                                ? 'info'
                                : 'secondary'
                          }
                        >
                          {sub.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={priorityVariant[sub.priority] ?? 'secondary'}>
                          {sub.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{agentName}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {issueRuns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Run History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issueRuns.map((run) => {
                  const roleLabel = getRunRoleLabel(run.agentId);
                  const agentName = agentMap.get(run.agentId)?.name ?? run.agentId.slice(0, 8);
                  return (
                    <TableRow key={run.id}>
                      <TableCell className="font-mono text-xs">{run.id.slice(0, 8)}</TableCell>
                      <TableCell>
                        <Badge variant={roleLabel === 'QA Review' ? 'warning' : roleLabel === 'Developer Run' ? 'info' : 'secondary'}>
                          {roleLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{agentName}</TableCell>
                      <TableCell>
                        <Badge variant={run.status === 'succeeded' ? 'success' : run.status === 'failed' ? 'destructive' : 'secondary'}>
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {run.summary ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {run.startedAt ? new Date(run.startedAt).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedRunId(selectedRunId === run.id ? null : run.id)}>
                          {selectedRunId === run.id ? 'Hide' : 'Logs'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {selectedRunId && (
        <Card>
          <CardHeader>
            <CardTitle>Run Transcript</CardTitle>
          </CardHeader>
          <CardContent>
            <RunTranscriptView runId={selectedRunId} />
          </CardContent>
        </Card>
      )}

      {/* Completion Report + Reject/Retry */}
      {issue?.status === 'done' && (
        <CompletionReportSection issueId={issueId!} companyId={companyId} />
      )}
    </div>
  );
}

// ── Completion Report + Reject ──

function CompletionReportSection({ issueId, companyId }: { issueId: string; companyId: string }) {
  const { data: report, isLoading } = useIssueReport(issueId);
  const rejectMutation = useRejectIssue();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const handleReject = () => {
    if (!rejectReason.trim()) return;
    rejectMutation.mutate(
      { issueId, reason: rejectReason.trim() },
      {
        onSuccess: () => {
          setRejectOpen(false);
          setRejectReason('');
        },
      },
    );
  };

  return (
    <>
      {/* Action Buttons */}
      <div className="flex gap-2">
        <Badge variant="outline" className="text-green-600 border-green-600">
          <CheckCircle className="h-3 w-3 mr-1" /> Completed
        </Badge>
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <XCircle className="h-4 w-4 mr-1" /> Reject & Retry
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject & Retry Issue</DialogTitle>
              <DialogDescription>This will cancel all sub-tasks and restart the work from scratch.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              <Label htmlFor="reject-reason">Reason</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Why is this work being rejected?"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleReject} disabled={!rejectReason.trim() || rejectMutation.isPending}>
                {rejectMutation.isPending ? 'Rejecting...' : 'Reject & Retry'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Report */}
      <Card>
        <CardHeader>
          <CardTitle>Completion Report</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading report...</p>
          ) : report ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Total runs: {report.totalRuns}</p>
              {report.subtasks.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sub-task</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Summary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.subtasks.map((st, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{st.title}</TableCell>
                        <TableCell><Badge variant={st.status === 'done' ? 'default' : 'secondary'}>{st.status}</Badge></TableCell>
                        <TableCell>{st.agentName}</TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{st.summary}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {report.subtasks.length === 0 && (
                <p className="text-sm text-muted-foreground">No sub-tasks recorded.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No completion report available.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
