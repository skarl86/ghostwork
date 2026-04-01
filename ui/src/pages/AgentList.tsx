import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCompanyContext } from '@/providers/CompanyProvider';
import { useAgents, useCreateAgent, useAdapterModels } from '@/hooks/queries';

/** Map role → skill names for display */
function getSkillsForRole(role: string): { name: string; description: string }[] {
  const base = { name: 'ghostwork-agent', description: 'Base behavior rules' };
  const lower = role.toLowerCase().trim();
  switch (lower) {
    case 'engineer':
    case 'developer':
      return [base, { name: 'ghostwork-engineer', description: 'Code writing, debugging, implementation' }];
    case 'qa':
    case 'reviewer':
    case '리뷰어':
      return [base, { name: 'ghostwork-qa', description: 'Code review, testing, quality assurance' }];
    case 'pm':
      return [base, { name: 'ghostwork-pm', description: 'Task analysis, planning, coordination' }];
    case 'designer':
      return [base, { name: 'ghostwork-designer', description: 'UI/UX review, design system, accessibility' }];
    default:
      return [base];
  }
}

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'info'> = {
  idle: 'secondary' as 'default',
  running: 'success',
  paused: 'warning',
  error: 'destructive',
  active: 'info',
};

export function AgentList() {
  const { companyId } = useCompanyContext();
  const { data: agents, isLoading } = useAgents(companyId);
  const createMutation = useCreateAgent();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setDialogOpen(true);
      searchParams.delete('create');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [reportsTo, setReportsTo] = useState<string>('none');
  const [adapterType, setAdapterType] = useState('claude-local');
  const [model, setModel] = useState('');
  const { data: models } = useAdapterModels(adapterType);

  const filtered =
    filterStatus === 'all' ? agents : agents?.filter((a) => a.status === filterStatus);

  const handleCreate = () => {
    if (!name.trim()) return;

    // Default adapterConfig based on adapter type
    const adapterConfig =
      adapterType === 'process'
        ? { command: 'echo', args: ['done'] }
        : model
          ? { model }
          : {};

    const runtimeConfig = { intervalSec: 60, maxConcurrentRuns: 1 };

    createMutation.mutate(
      {
        companyId,
        name: name.trim(),
        role: role.trim() || undefined,
        reportsTo: reportsTo !== 'none' ? reportsTo : null,
        adapterType,
        adapterConfig,
        runtimeConfig,
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setName('');
          setRole('');
          setReportsTo('none');
          setModel('');
        },
      },
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
        <div className="flex gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="idle">Idle</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="pending_approval">Pending Approval</SelectItem>
            </SelectContent>
          </Select>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" />
                New Agent
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Agent</DialogTitle>
                <DialogDescription>Add a new AI agent to your company.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="agent-name">Name</Label>
                  <Input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="agent-role">Role</Label>
                  <Input id="agent-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g., engineer, qa, pm, designer" />
                  {role.trim() && (
                    <p className="text-xs text-muted-foreground">
                      Skills: {getSkillsForRole(role).map((s) => s.name).join(', ')}
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label>Reports To</Label>
                  <Select value={reportsTo} onValueChange={setReportsTo}>
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {agents?.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Adapter Type</Label>
                  <Select value={adapterType} onValueChange={(v) => { setAdapterType(v); setModel(''); }}>
                    <SelectTrigger>
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
                {models && models.length > 0 && (
                  <div className="grid gap-2">
                    <Label>Model</Label>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map((m: { id: string; name: string; provider: string }) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={handleCreate} disabled={createMutation.isPending || !name.trim()}>
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading agents...</p>
      ) : !filtered || filtered.length === 0 ? (
        <p className="text-muted-foreground">No agents found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Reports To</TableHead>
              <TableHead>Adapter</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell>
                  <Link to={`/${companyId}/agents/${agent.id}`} className="font-medium hover:underline">
                    {agent.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{agent.role ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {agent.reportsTo ? (
                    <Link to={`/${companyId}/agents/${agent.reportsTo}`} className="hover:underline">
                      {agents?.find((a) => a.id === agent.reportsTo)?.name ?? agent.reportsTo.slice(0, 8)}
                    </Link>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">{agent.adapterType}</TableCell>
                <TableCell className="text-muted-foreground">
                  {(agent.adapterConfig as Record<string, unknown>)?.model as string ?? '—'}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant[agent.status] ?? 'secondary'}>{agent.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{new Date(agent.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
