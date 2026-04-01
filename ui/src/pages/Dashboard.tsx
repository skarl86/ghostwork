import { Link } from 'react-router';
import { Bot, AlertCircle, Play, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCompanyContext } from '@/providers/CompanyProvider';
import { useAgents, useIssues, useRuns, useActivity } from '@/hooks/queries';

function MetricCard({ title, value, icon: Icon }: { title: string; value: number | string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const { companyId } = useCompanyContext();
  const { data: agents } = useAgents(companyId);
  const { data: issues } = useIssues(companyId);
  const { data: runs } = useRuns(companyId);
  const { data: activity } = useActivity(companyId);

  const totalAgents = agents?.length ?? 0;
  const activeAgents = agents?.filter((a) => a.status === 'running').length ?? 0;
  const openIssues = issues?.filter((i) => !['done', 'closed', 'cancelled'].includes(i.status)).length ?? 0;
  const runningRuns = runs?.filter((r) => r.status === 'running').length ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/${companyId}/agents?create=true`}>
              <Plus className="mr-1 h-4 w-4" />
              New Agent
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/${companyId}/issues?create=true`}>
              <Plus className="mr-1 h-4 w-4" />
              New Issue
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Total Agents" value={totalAgents} icon={Bot} />
        <MetricCard title="Active Agents" value={activeAgents} icon={Play} />
        <MetricCard title="Open Issues" value={openIssues} icon={AlertCircle} />
        <MetricCard title="Running Runs" value={runningRuns} icon={Play} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {!activity || activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            <div className="space-y-2">
              {activity.slice(0, 10).map((a) => (
                <div key={a.id} className="flex items-center gap-3 text-sm">
                  <span className="text-xs text-muted-foreground w-32 shrink-0">
                    {new Date(a.createdAt).toLocaleString()}
                  </span>
                  <span className="truncate">
                    <span className="font-medium">{a.action}</span>
                    {a.entityType && <span className="text-muted-foreground"> — {a.entityType}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
