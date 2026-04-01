import { useState, useCallback } from 'react';
import { useCompanyContext } from '@/providers/CompanyProvider';
import { useGoals, useCreateGoal } from '@/hooks/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ChevronRight, ChevronDown, Plus, Target } from 'lucide-react';
import type { Goal } from '@/lib/api';

const LEVEL_LABELS: Record<string, string> = {
  strategic: '🎯 Strategic',
  company: '🏢 Company',
  project: '📁 Project',
  task: '✅ Task',
};

function statusVariant(status: string) {
  switch (status) {
    case 'active': return 'success' as const;
    case 'completed': return 'info' as const;
    case 'cancelled': return 'destructive' as const;
    default: return 'secondary' as const;
  }
}

interface GoalNodeProps {
  goal: Goal;
  children: Goal[];
  allGoals: Goal[];
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  depth: number;
}

function GoalNode({ goal, children, allGoals, expandedIds, toggleExpanded, depth }: GoalNodeProps) {
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(goal.id);

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-accent/50 transition-colors min-h-[44px]"
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
      >
        <button
          onClick={() => hasChildren && toggleExpanded(goal.id)}
          className="flex h-5 w-5 shrink-0 items-center justify-center"
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
          ) : (
            <span className="h-4 w-4" />
          )}
        </button>
        <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-sm font-medium">{goal.title}</span>
        <span className="text-xs text-muted-foreground">{LEVEL_LABELS[goal.level] ?? goal.level}</span>
        <Badge variant={statusVariant(goal.status)} className="text-xs">
          {goal.status}
        </Badge>
      </div>
      {isExpanded && children.map((child) => (
        <GoalNode
          key={child.id}
          goal={child}
          children={allGoals.filter((g) => g.parentId === child.id)}
          allGoals={allGoals}
          expandedIds={expandedIds}
          toggleExpanded={toggleExpanded}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

export function Goals() {
  const { companyId } = useCompanyContext();
  const { data: goals, isLoading } = useGoals(companyId);
  const createGoal = useCreateGoal();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({ title: '', level: 'company', status: 'planned', parentId: '' });

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCreate = () => {
    createGoal.mutate(
      {
        companyId,
        title: formData.title,
        level: formData.level,
        status: formData.status,
        parentId: formData.parentId || undefined,
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          setFormData({ title: '', level: 'company', status: 'planned', parentId: '' });
        },
      },
    );
  };

  const allGoals = goals ?? [];
  const roots = allGoals.filter((g) => !g.parentId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <h1 className="text-xl font-semibold">Goals</h1>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          New Goal
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="text-muted-foreground">Loading goals...</div>
        ) : allGoals.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Target className="h-12 w-12 opacity-40" />
            <p>No goals yet. Create your first goal.</p>
          </div>
        ) : (
          <div className="rounded-lg border">
            {roots.map((goal) => (
              <GoalNode
                key={goal.id}
                goal={goal}
                children={allGoals.filter((g) => g.parentId === goal.id)}
                allGoals={allGoals}
                expandedIds={expandedIds}
                toggleExpanded={toggleExpanded}
                depth={0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Goal</DialogTitle>
            <DialogDescription>Define a new goal for your organization.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="goal-title">Title</Label>
              <Input
                id="goal-title"
                value={formData.title}
                onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                placeholder="Goal title"
              />
            </div>
            <div className="space-y-2">
              <Label>Level</Label>
              <Select value={formData.level} onValueChange={(v) => setFormData((f) => ({ ...f, level: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="strategic">Strategic</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {allGoals.length > 0 && (
              <div className="space-y-2">
                <Label>Parent Goal (optional)</Label>
                <Select value={formData.parentId} onValueChange={(v) => setFormData((f) => ({ ...f, parentId: v }))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {allGoals.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!formData.title || createGoal.isPending}>
              {createGoal.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
