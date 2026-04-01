import { useState, useEffect } from 'react';
import { useCompanyContext } from '@/providers/CompanyProvider';
import { useUpdateCompany } from '@/hooks/queries';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { CheckCircle, FolderCheck, Settings, Save, FolderOpen, Pencil, XCircle } from 'lucide-react';
import { fetchProjects, fetchProjectWorkspace, setProjectWorkspace, validateWorkspacePath, type Project } from '@/lib/api';

function ProjectWorkspaceRow({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cwdInput, setCwdInput] = useState('');
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{ valid: boolean; reason?: string } | null>(null);

  const { data: workspace, isLoading } = useQuery({
    queryKey: ['project-workspace', project.id],
    queryFn: () => fetchProjectWorkspace(project.id),
  });

  const saveMutation = useMutation({
    mutationFn: (cwd: string) => setProjectWorkspace(project.id, { cwd }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-workspace', project.id] });
      setDialogOpen(false);
    },
  });

  const openDialog = () => {
    setCwdInput(workspace?.cwd ?? '');
    setValidation(null);
    setDialogOpen(true);
  };

  const handleValidate = async () => {
    if (!cwdInput.trim()) return;
    setValidating(true);
    setValidation(null);
    try {
      const result = await validateWorkspacePath(cwdInput.trim());
      setValidation(result);
    } catch {
      setValidation({ valid: false, reason: 'Failed to validate path' });
    } finally {
      setValidating(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between py-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{project.name}</p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : workspace?.cwd ? (
            <p className="truncate text-sm text-muted-foreground font-mono">{workspace.cwd}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No workspace set</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={openDialog}>
          {workspace?.cwd ? <Pencil className="h-4 w-4" /> : <FolderOpen className="h-4 w-4" />}
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Workspace — {project.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="workspace-cwd">Working Directory (cwd)</Label>
            <div className="flex gap-2">
              <Input
                id="workspace-cwd"
                value={cwdInput}
                onChange={(e) => {
                  setCwdInput(e.target.value);
                  setValidation(null);
                }}
                placeholder="/path/to/project"
                className="flex-1 font-mono text-sm"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleValidate}
                disabled={validating || !cwdInput.trim()}
              >
                <FolderCheck className="mr-1 h-4 w-4" />
                {validating ? 'Checking...' : 'Verify'}
              </Button>
            </div>
            {validation && (
              <div className={`flex items-center gap-1.5 text-sm ${validation.valid ? 'text-green-600' : 'text-red-600'}`}>
                {validation.valid ? (
                  <><CheckCircle className="h-4 w-4" /> Valid path</>
                ) : (
                  <><XCircle className="h-4 w-4" /> {validation.reason}</>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Agents working on issues in this project will use this directory.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate(cwdInput)}
              disabled={!cwdInput.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CompanySettings() {
  const { companyId, company } = useCompanyContext();
  const updateCompany = useUpdateCompany();
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [saved, setSaved] = useState(false);

  const { data: projects } = useQuery({
    queryKey: ['projects', companyId],
    queryFn: () => fetchProjects(companyId),
    enabled: !!companyId,
  });

  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name,
        description: company.description ?? '',
      });
    }
  }, [company]);

  const handleSave = () => {
    updateCompany.mutate(
      { id: companyId, data: { name: formData.name, description: formData.description || null } },
      { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); } },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3 sm:px-6">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Company Settings</h1>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>Basic company information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company-name">Company Name</Label>
                <Input
                  id="company-name"
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company-desc">Description</Label>
                <Textarea
                  id="company-desc"
                  value={formData.description}
                  onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <Button onClick={handleSave} disabled={updateCompany.isPending || !formData.name}>
                <Save className="mr-1 h-4 w-4" />
                {saved ? 'Saved!' : updateCompany.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>

          {/* Project Workspaces */}
          {projects && projects.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Project Workspaces</CardTitle>
                <CardDescription>Set the working directory for each project. Agents will run in these directories.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {projects.map((p) => (
                    <ProjectWorkspaceRow key={p.id} project={p} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
              <CardDescription>Company operational status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Current Status</p>
                  <p className="text-sm text-muted-foreground capitalize">{company?.status ?? 'active'}</p>
                </div>
                <Button
                  variant={company?.status === 'paused' ? 'default' : 'outline'}
                  onClick={() => {
                    if (company?.status === 'paused') {
                      updateCompany.mutate({ id: companyId, data: { status: 'active' } });
                    } else {
                      if (window.confirm('This will stop all agents. Continue?')) {
                        updateCompany.mutate({ id: companyId, data: { status: 'paused' } });
                      }
                    }
                  }}
                >
                  {company?.status === 'paused' ? 'Resume' : 'Pause'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
