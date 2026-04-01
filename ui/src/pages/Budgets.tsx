import { useState } from 'react';
import { useCompanyContext } from '@/providers/CompanyProvider';
import { useBudgetPolicies, useCreateBudgetPolicy } from '@/hooks/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Wallet } from 'lucide-react';

export function Budgets() {
  const { companyId } = useCompanyContext();
  const { data: policies, isLoading } = useBudgetPolicies(companyId);
  const createPolicy = useCreateBudgetPolicy();
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({
    scopeType: 'company',
    windowKind: 'monthly',
    amount: '',
  });

  const handleCreate = () => {
    createPolicy.mutate(
      {
        companyId,
        scopeType: formData.scopeType,
        windowKind: formData.windowKind,
        amount: parseInt(formData.amount, 10),
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          setFormData({ scopeType: 'company', windowKind: 'monthly', amount: '' });
        },
      },
    );
  };

  const allPolicies = policies ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <h1 className="text-xl font-semibold">Budget Policies</h1>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          New Policy
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="text-muted-foreground">Loading policies...</div>
        ) : allPolicies.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Wallet className="h-12 w-12 opacity-40" />
            <p>No budget policies. Create one to track spending.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allPolicies.map((policy) => (
              <Card key={policy.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base capitalize">
                      {policy.scopeType} budget
                    </CardTitle>
                    <Badge variant="outline" className="capitalize">{policy.windowKind}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-medium">${policy.amount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Metric</span>
                    <span>{policy.metric || 'cost_usd'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Warn at</span>
                    <span>{policy.warnPercent}%</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {policy.hardStopEnabled && <Badge variant="destructive" className="text-xs">Hard stop</Badge>}
                    {policy.notifyEnabled && <Badge variant="info" className="text-xs">Notifications</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Budget Policy</DialogTitle>
            <DialogDescription>Set a spending limit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={formData.scopeType} onValueChange={(v) => setFormData((f) => ({ ...f, scopeType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy-amount">Amount (cents)</Label>
              <Input
                id="policy-amount"
                type="number"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData((f) => ({ ...f, amount: e.target.value }))}
                placeholder="10000"
              />
            </div>
            <div className="space-y-2">
              <Label>Window</Label>
              <Select value={formData.windowKind} onValueChange={(v) => setFormData((f) => ({ ...f, windowKind: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="lifetime">Lifetime</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!formData.amount || createPolicy.isPending}>
              {createPolicy.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
