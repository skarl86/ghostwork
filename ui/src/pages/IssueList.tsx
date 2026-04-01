import { useState, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { cn } from '@/lib/utils';
import { useCompanyContext } from '@/providers/CompanyProvider';
import { useIssues, useCreateIssue, useUpdateIssue, useAgents, useProjects } from '@/hooks/queries';
import type { Issue, IssueStatus } from '@/lib/api';
import { Link, useSearchParams } from 'react-router';

const COLUMNS = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'Todo' },
  { id: 'plan_review', label: 'Plan Review' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'done', label: 'Done' },
  { id: 'cancelled', label: 'Cancelled' },
] as const;

const priorityVariant: Record<string, 'default' | 'destructive' | 'warning' | 'info' | 'secondary'> = {
  urgent: 'destructive',
  high: 'warning',
  medium: 'info',
  low: 'secondary',
};

const statusVariant: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'purple'> = {
  plan_review: 'purple',
  in_progress: 'info',
  in_review: 'warning',
  done: 'success',
};

function IssueCard({ issue, isDragging, subTaskCount }: { issue: Issue; isDragging?: boolean; subTaskCount?: number }) {
  const { companyId } = useCompanyContext();
  return (
    <div className={cn('rounded-md border bg-card p-3 shadow-sm space-y-2', isDragging && 'opacity-50 rotate-2', issue.parentId && 'ml-2 border-l-2 border-l-muted-foreground/30')}>
      <Link to={`/${companyId}/issues/${issue.id}`} className="font-medium text-sm hover:underline line-clamp-2">
        {issue.parentId && <span className="text-muted-foreground mr-1">↳</span>}
        {issue.title}
      </Link>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={priorityVariant[issue.priority] ?? 'secondary'} className="text-xs">
          {issue.priority}
        </Badge>
        {statusVariant[issue.status] && (
          <Badge variant={statusVariant[issue.status]} className="text-xs">
            {issue.status.replace('_', ' ')}
          </Badge>
        )}
        {issue.assigneeAgentId && (
          <span className="text-xs text-muted-foreground truncate">
            Agent: {issue.assigneeAgentId.slice(0, 8)}
          </span>
        )}
        {subTaskCount != null && subTaskCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            📋 {subTaskCount} sub-tasks
          </Badge>
        )}
      </div>
    </div>
  );
}

function SortableIssueCard({ issue, subTaskCount }: { issue: Issue; subTaskCount?: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <IssueCard issue={issue} isDragging={isDragging} subTaskCount={subTaskCount} />
    </div>
  );
}

function KanbanColumn({
  column,
  issues,
  subTaskCounts,
}: {
  column: (typeof COLUMNS)[number];
  issues: Issue[];
  subTaskCounts: Map<string, number>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.id}` });

  // Sort: parent issues first, then sub-issues grouped under their parent
  const sorted = sortWithSubIssues(issues);

  return (
    <div className="flex flex-col min-w-[180px] w-56 shrink-0">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {column.label}
        </h3>
        <Badge variant="secondary" className="text-xs">
          {issues.length}
        </Badge>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-2 min-h-[200px] rounded-lg bg-muted/30 p-2 transition-colors',
          isOver && 'ring-2 ring-primary/50 bg-muted/50',
        )}
      >
        <SortableContext items={sorted.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {sorted.map((issue) => (
            <SortableIssueCard
              key={issue.id}
              issue={issue}
              subTaskCount={subTaskCounts.get(issue.id)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

/** Sort issues so sub-issues appear after their parent in each column */
function sortWithSubIssues(columnIssues: Issue[]): Issue[] {
  const parents = columnIssues.filter((i) => !i.parentId);
  const children = columnIssues.filter((i) => !!i.parentId);
  const childrenByParent = new Map<string, Issue[]>();
  for (const child of children) {
    const list = childrenByParent.get(child.parentId!) ?? [];
    list.push(child);
    childrenByParent.set(child.parentId!, list);
  }

  const result: Issue[] = [];
  for (const parent of parents) {
    result.push(parent);
    const kids = childrenByParent.get(parent.id);
    if (kids) {
      result.push(...kids);
      childrenByParent.delete(parent.id);
    }
  }
  // Orphaned sub-issues (parent in a different column)
  for (const orphans of childrenByParent.values()) {
    result.push(...orphans);
  }
  return result;
}

export function IssueList() {
  const { companyId } = useCompanyContext();
  const { data: issues, isLoading } = useIssues(companyId);
  const createMutation = useCreateIssue();
  const updateMutation = useUpdateIssue();

  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assigneeAgentId, setAssigneeAgentId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const { data: agents } = useAgents(companyId);
  const { data: projects } = useProjects(companyId);

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setDialogOpen(true);
      searchParams.delete('create');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const issuesByStatus = new Map<string, Issue[]>();
  for (const col of COLUMNS) {
    issuesByStatus.set(col.id, []);
  }

  // Compute sub-task counts per parent issue
  const subTaskCounts = new Map<string, number>();
  if (issues) {
    for (const issue of issues) {
      if (issue.parentId) {
        subTaskCounts.set(issue.parentId, (subTaskCounts.get(issue.parentId) ?? 0) + 1);
      }
    }
    for (const issue of issues) {
      const list = issuesByStatus.get(issue.status);
      if (list) {
        list.push(issue);
      } else {
        // Unknown status → backlog
        issuesByStatus.get('backlog')?.push(issue);
      }
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    const issue = issues?.find((i) => i.id === event.active.id);
    if (issue) setActiveIssue(issue);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveIssue(null);
    const { active, over } = event;
    if (!over) return;

    const draggedIssue = issues?.find((i) => i.id === active.id);
    if (!draggedIssue) return;

    let targetStatus: string | null = null;

    // Check if dropped on another issue card
    const overIssue = issues?.find((i) => i.id === over.id);
    if (overIssue) {
      targetStatus = overIssue.status;
    } else {
      // Check if dropped on a column droppable (id = "column:<status>")
      const overId = String(over.id);
      if (overId.startsWith('column:')) {
        targetStatus = overId.slice('column:'.length);
      }
    }

    if (targetStatus && targetStatus !== draggedIssue.status) {
      updateMutation.mutate({
        issueId: draggedIssue.id,
        data: { status: targetStatus as IssueStatus },
      });
    }
  };

  const handleCreate = () => {
    if (!title.trim()) return;
    createMutation.mutate(
      {
        companyId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        status: 'backlog',
        assigneeAgentId: assigneeAgentId && assigneeAgentId !== '__none__' ? assigneeAgentId : undefined,
        projectId: projectId && projectId !== '__none__' ? projectId : undefined,
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setTitle('');
          setDescription('');
          setPriority('medium');
          setAssigneeAgentId('');
          setProjectId('');
        },
      },
    );
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading issues...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Issues</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1 h-4 w-4" />
              New Issue
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Issue</DialogTitle>
              <DialogDescription>Create a new issue for your agents to work on.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="issue-title">Title</Label>
                <Input id="issue-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Issue title" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="issue-desc">Description</Label>
                <Textarea id="issue-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the issue..." />
              </div>
              <div className="grid gap-2">
                <Label>Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="No project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No project</SelectItem>
                    {projects?.map((project: { id: string; name: string }) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Assignee Agent</Label>
                <Select value={assigneeAgentId} onValueChange={setAssigneeAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="No agent assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {agents?.map((agent: { id: string; name: string }) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={createMutation.isPending || !title.trim()}>
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="relative">
          <div className="flex gap-4 overflow-x-auto pb-4">
            {COLUMNS.map((col) => (
              <KanbanColumn key={col.id} column={col} issues={issuesByStatus.get(col.id) ?? []} subTaskCounts={subTaskCounts} />
            ))}
          </div>
          <div className="pointer-events-none absolute right-0 top-0 bottom-4 w-12 bg-gradient-to-l from-background to-transparent" />
        </div>
        <DragOverlay>
          {activeIssue ? <IssueCard issue={activeIssue} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
