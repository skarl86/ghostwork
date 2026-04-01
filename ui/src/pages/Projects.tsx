import { useState } from 'react';
import { useCompanyContext } from '@/providers/CompanyProvider';
import {
  useProjects,
  useCreateProject,
  useProjectWorkspace,
  useSetProjectWorkspace,
  useUpdateProjectWorkspace,
} from '@/hooks/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronDown, ChevronRight, FolderKanban, Plus } from 'lucide-react';
import type { Project, ProjectWorkspace } from '@/lib/api';

function statusVariant(status: string) {
  switch (status) {
    case 'active':
      return 'success' as const;
    case 'completed':
      return 'info' as const;
    case 'archived':
      return 'secondary' as const;
    default:
      return 'default' as const;
  }
}

function WorkspaceDetail({ projectId }: { projectId: string }) {
  const { data: workspace, isLoading } = useProjectWorkspace(projectId);
  const setWorkspace = useSetProjectWorkspace();
  const updateWorkspace = useUpdateProjectWorkspace();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ cwd: '', repoUrl: '', branch: '' });

  const startEdit = (ws?: ProjectWorkspace | null) => {
    setForm({
      cwd: ws?.cwd ?? '',
      repoUrl: ws?.repoUrl ?? '',
      branch: ws?.branch ?? '',
    });
    setEditing(true);
  };

  const handleSave = () => {
    if (!form.cwd.trim()) return;
    const data = {
      cwd: form.cwd.trim(),
      repoUrl: form.repoUrl.trim() || undefined,
      branch: form.branch.trim() || undefined,
    };

    if (workspace) {
      updateWorkspace.mutate(
        { projectId, data },
        { onSuccess: () => setEditing(false) },
      );
    } else {
      setWorkspace.mutate(
        { projectId, data },
        { onSuccess: () => setEditing(false) },
      );
    }
  };

  const isSaving = setWorkspace.isPending || updateWorkspace.isPending;

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-2">Loading workspace...</div>;
  }

  if (editing) {
    return (
      <div className="space-y-3 py-2">
        <div className="grid gap-2">
          <Label htmlFor={`ws-cwd-${projectId}`}>Working Directory (cwd)</Label>
          <Input
            id={`ws-cwd-${projectId}`}
            value={form.cwd}
            onChange={(e) => setForm((f) => ({ ...f, cwd: e.target.value }))}
            placeholder="/path/to/project"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`ws-repo-${projectId}`}>Repository URL</Label>
          <Input
            id={`ws-repo-${projectId}`}
            value={form.repoUrl}
            onChange={(e) => setForm((f) => ({ ...f, repoUrl: e.target.value }))}
            placeholder="https://github.com/org/repo"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`ws-branch-${projectId}`}>Branch</Label>
          <Input
            id={`ws-branch-${projectId}`}
            value={form.branch}
            onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
            placeholder="main"
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={isSaving || !form.cwd.trim()}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex items-center gap-3 py-2">
        <span className="text-sm text-muted-foreground">No workspace configured</span>
        <Button size="sm" variant="outline" onClick={() => startEdit()}>
          Set Workspace
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1 py-2">
      <div className="text-sm">
        <span className="text-muted-foreground">cwd:</span>{' '}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">{workspace.cwd}</code>
      </div>
      {workspace.repoUrl && (
        <div className="text-sm">
          <span className="text-muted-foreground">repo:</span>{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">{workspace.repoUrl}</code>
        </div>
      )}
      {workspace.branch && (
        <div className="text-sm">
          <span className="text-muted-foreground">branch:</span>{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">{workspace.branch}</code>
        </div>
      )}
      <Button size="sm" variant="outline" className="mt-2" onClick={() => startEdit(workspace)}>
        Edit Workspace
      </Button>
    </div>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-accent/50"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell className="w-8">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </TableCell>
        <TableCell className="font-medium">{project.name}</TableCell>
        <TableCell>
          <Badge variant={statusVariant(project.status)}>{project.status}</Badge>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">
          {project.description || '—'}
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">
          {new Date(project.createdAt).toLocaleDateString()}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell />
          <TableCell colSpan={4}>
            <div className="border-l-2 border-muted pl-4 py-2">
              <h4 className="text-sm font-semibold mb-1">Workspace Settings</h4>
              <WorkspaceDetail projectId={project.id} />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function Projects() {
  const { companyId } = useCompanyContext();
  const { data: projects, isLoading } = useProjects(companyId);
  const createProject = useCreateProject();
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });

  const handleCreate = () => {
    if (!formData.name.trim()) return;
    createProject.mutate(
      {
        companyId,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          setFormData({ name: '', description: '' });
        },
      },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <h1 className="text-xl font-semibold">Projects</h1>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          New Project
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="text-muted-foreground">Loading projects...</div>
        ) : !projects || projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <FolderKanban className="h-12 w-12 opacity-40" />
            <p>No projects yet. Create your first project.</p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <ProjectRow key={project.id} project={project} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>Create a new project for your organization.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                placeholder="Project name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-desc">Description</Label>
              <Textarea
                id="project-desc"
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!formData.name.trim() || createProject.isPending}
            >
              {createProject.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
