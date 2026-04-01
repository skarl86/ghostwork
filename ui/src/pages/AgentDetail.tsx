import { useParams, Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RunTranscriptView } from '@/components/RunTranscript';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCompanyContext } from '@/providers/CompanyProvider';
import { useAgent, useAgents, useRuns, useUpdateAgent, useAdapterModels } from '@/hooks/queries';
import { useState, useRef } from 'react';

/** Map agent role → assigned skill info */
function getSkillsForRole(role: string): { name: string; description: string }[] {
  const base = { name: 'ghostwork-agent', description: 'Base behavior rules for Ghostwork agents. Injected into every agent run.' };
  const lower = (role ?? '').toLowerCase().trim();
  switch (lower) {
    case 'engineer':
    case 'developer':
      return [base, { name: 'ghostwork-engineer', description: 'Engineering skill for developer agents. Code writing, debugging, implementation.' }];
    case 'qa':
    case 'reviewer':
    case '리뷰어':
      return [base, { name: 'ghostwork-qa', description: 'QA review skill for reviewer agents. Code review, testing, quality assurance.' }];
    case 'pm':
      return [base, { name: 'ghostwork-pm', description: 'Project management skill. Task analysis, planning, coordination.' }];
    case 'designer':
      return [base, { name: 'ghostwork-designer', description: 'Design skill. UI/UX review, design system, accessibility.' }];
    default:
      return [base];
  }
}

export function AgentDetail() {
  const { companyId } = useCompanyContext();
  const { agentId } = useParams<{ agentId: string }>();
  const { data: agent, isLoading } = useAgent(agentId ?? '');
  const { data: agents } = useAgents(companyId);
  const { data: runs } = useRuns(companyId, agentId);
  const updateMutation = useUpdateAgent();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [showAllRuns, setShowAllRuns] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const { data: adapterModels } = useAdapterModels(agent?.adapterType ?? '');
  const subordinates = agents?.filter((a) => a.reportsTo === agentId);

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading agent...</div>;
  if (!agent) return <div className="p-6 text-muted-foreground">Agent not found.</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/${companyId}/agents`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{agent.name}</h1>
          <p className="text-muted-foreground">{agent.role ?? 'No role defined'}</p>
        </div>
        <Badge className="ml-auto" variant={agent.status === 'running' ? 'success' : agent.status === 'error' ? 'destructive' : 'secondary'}>
          {agent.status}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Agent Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Adapter</span>
              <Select
                value={agent.adapterType}
                onValueChange={(value) => {
                  if (!agentId) return;
                  updateMutation.mutate({
                    agentId,
                    data: { adapterType: value },
                  });
                }}
              >
                <SelectTrigger className="w-40 h-8 text-sm font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="process">Process</SelectItem>
                  <SelectItem value="claude-local">Claude Local</SelectItem>
                  <SelectItem value="codex-local">Codex Local</SelectItem>
                  <SelectItem value="gemini-local">Gemini Local</SelectItem>
                  <SelectItem value="openclaw-gateway">OpenClaw Gateway</SelectItem>
                  <SelectItem value="http">HTTP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {adapterModels && adapterModels.length > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Model</span>
                <Select
                  value={(agent.adapterConfig as Record<string, unknown> | null)?.model as string ?? ''}
                  onValueChange={(value) => {
                    if (!agentId) return;
                    updateMutation.mutate({
                      agentId,
                      data: {
                        adapterConfig: {
                          ...(agent.adapterConfig as Record<string, unknown> ?? {}),
                          model: value,
                        },
                      },
                    });
                  }}
                >
                  <SelectTrigger className="w-40 h-8 text-sm font-mono">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {adapterModels.map((m: string | { id: string; name: string }) => {
                      const id = typeof m === 'string' ? m : m.id;
                      const label = typeof m === 'string' ? m : m.name;
                      return (
                        <SelectItem key={id} value={id}>{label}</SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Title</span>
              <span>{agent.title ?? '—'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Reports To</span>
              <Select
                value={agent.reportsTo ?? 'none'}
                onValueChange={(value) => {
                  if (!agentId) return;
                  updateMutation.mutate({
                    agentId,
                    data: { reportsTo: value !== 'none' ? value : null },
                  });
                }}
              >
                <SelectTrigger className="w-40 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {agents
                    ?.filter((a) => a.id !== agentId)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {subordinates && subordinates.length > 0 && (
              <div className="pt-2 border-t">
                <span className="text-muted-foreground text-xs">Direct Reports</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {subordinates.map((sub) => (
                    <Link
                      key={sub.id}
                      to={`/${companyId}/agents/${sub.id}`}
                      className="text-xs px-2 py-0.5 rounded-md bg-muted hover:underline"
                    >
                      {sub.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(agent.createdAt).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            {agent.runtimeConfig || agent.adapterConfig ? (
              <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-48">
                {JSON.stringify({ runtimeConfig: agent.runtimeConfig, adapterConfig: agent.adapterConfig }, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">No configuration set.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Skills</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Skills are automatically assigned based on the agent's role ({agent.role ?? 'general'}).
          </p>
          <div className="space-y-2">
            {getSkillsForRole(agent.role ?? 'general').map((skill) => (
              <div key={skill.name} className="flex items-start gap-3 p-2 rounded-md bg-muted">
                <Badge variant="secondary" className="mt-0.5 shrink-0">{skill.name}</Badge>
                <span className="text-sm text-muted-foreground">{skill.description}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {!runs || runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(showAllRuns ? runs : runs.slice(0, 10)).map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-mono text-xs">{run.id.slice(0, 8)}</TableCell>
                    <TableCell>
                      <Badge variant={run.status === 'succeeded' ? 'success' : run.status === 'failed' ? 'destructive' : run.status === 'running' ? 'info' : 'secondary'}>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {run.startedAt ? new Date(run.startedAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {run.completedAt ? new Date(run.completedAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {run.costUsd ? `$${run.costUsd}` : '—'}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => {
                        const newId = selectedRunId === run.id ? null : run.id;
                        setSelectedRunId(newId);
                        if (newId) {
                          setTimeout(() => transcriptRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                        }
                      }}>
                        {selectedRunId === run.id ? 'Hide' : 'Logs'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!showAllRuns && runs.length > 10 && (
              <div className="mt-3 text-center">
                <Button variant="outline" size="sm" onClick={() => setShowAllRuns(true)}>
                  Show more ({runs.length - 10} remaining)
                </Button>
              </div>
            )}
            {showAllRuns && runs.length > 10 && (
              <div className="mt-3 text-center">
                <Button variant="outline" size="sm" onClick={() => setShowAllRuns(false)}>
                  Show less
                </Button>
              </div>
            )}
          </>
          )}
        </CardContent>
      </Card>

      {selectedRunId && (
        <Card ref={transcriptRef}>
          <CardHeader>
            <CardTitle>Run Transcript — {selectedRunId.slice(0, 8)}</CardTitle>
          </CardHeader>
          <CardContent>
            <RunTranscriptView runId={selectedRunId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
