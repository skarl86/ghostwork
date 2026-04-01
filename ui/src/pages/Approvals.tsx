import { useState } from 'react';
import { useCompanyContext } from '@/providers/CompanyProvider';
import { useApprovals, useDecideApproval } from '@/hooks/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, Clock, ShieldCheck } from 'lucide-react';
import type { Approval } from '@/lib/api';

function statusVariant(status: string) {
  switch (status) {
    case 'approved': return 'success' as const;
    case 'rejected': return 'destructive' as const;
    case 'revision_requested': return 'warning' as const;
    default: return 'warning' as const;
  }
}

function approvalTitle(approval: Approval): string {
  const payload = approval.payload as Record<string, unknown> | null;
  if (payload?.agentName) return `${approval.type}: ${payload.agentName}`;
  return approval.type.replace(/_/g, ' ');
}

function ApprovalCard({ approval }: { approval: Approval }) {
  const decide = useDecideApproval();
  const [comment, setComment] = useState('');

  const handleDecide = (status: 'approved' | 'rejected') => {
    decide.mutate({ id: approval.id, data: { status, comment: comment || undefined } });
    setComment('');
  };

  const requestedBy = approval.requestedByUserId ?? approval.requestedByAgentId?.slice(0, 8) ?? 'system';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base capitalize">{approvalTitle(approval)}</CardTitle>
          <Badge variant={statusVariant(approval.status)}>{approval.status}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>Requested by: {requestedBy}</span>
            <span>{new Date(approval.createdAt).toLocaleString()}</span>
            {approval.decidedByUserId && <span>Decided by: {approval.decidedByUserId}</span>}
          </div>

          {approval.decisionNote && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium text-xs text-muted-foreground mb-1">Note</p>
              {approval.decisionNote}
            </div>
          )}

          {approval.payload && (
            <pre className="text-xs bg-muted p-2 rounded-md overflow-auto max-h-24">
              {JSON.stringify(approval.payload, null, 2)}
            </pre>
          )}

          {approval.status === 'pending' && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Input
                placeholder="Add a note (optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="flex-1"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDecide('approved')}
                  disabled={decide.isPending}
                  className="text-green-600 hover:text-green-700"
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDecide('rejected')}
                  disabled={decide.isPending}
                  className="text-red-600 hover:text-red-700"
                >
                  <XCircle className="mr-1 h-4 w-4" />
                  Reject
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function Approvals() {
  const { companyId } = useCompanyContext();
  const { data: approvals, isLoading } = useApprovals(companyId);

  const allApprovals = approvals ?? [];
  const pending = allApprovals.filter((a) => a.status === 'pending');
  const decided = allApprovals.filter((a) => a.status !== 'pending');

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <h1 className="text-xl font-semibold">Approvals</h1>
        {pending.length > 0 && (
          <Badge variant="warning">{pending.length} pending</Badge>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="text-muted-foreground">Loading approvals...</div>
        ) : allApprovals.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <ShieldCheck className="h-12 w-12 opacity-40" />
            <p>No approvals yet.</p>
          </div>
        ) : (
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending" className="min-h-[44px]">
                <Clock className="mr-1 h-4 w-4" />
                Pending ({pending.length})
              </TabsTrigger>
              <TabsTrigger value="decided" className="min-h-[44px]">
                <CheckCircle2 className="mr-1 h-4 w-4" />
                Decided ({decided.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="pending" className="mt-4 space-y-4">
              {pending.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">No pending approvals</p>
              ) : (
                pending.map((a) => <ApprovalCard key={a.id} approval={a} />)
              )}
            </TabsContent>
            <TabsContent value="decided" className="mt-4 space-y-4">
              {decided.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">No decided approvals</p>
              ) : (
                decided.map((a) => <ApprovalCard key={a.id} approval={a} />)
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
