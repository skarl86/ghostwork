import { useState } from 'react';
import { useCompanyContext } from '@/providers/CompanyProvider';
import { useRoutines, useCreateRoutine } from '@/hooks/queries';
import { describeCron } from '@/lib/cron';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import { Plus, Clock, Timer } from 'lucide-react';

export function Routines() {
  const { companyId } = useCompanyContext();
  const { data: routines, isLoading } = useRoutines(companyId);
  const createRoutine = useCreateRoutine();
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', triggerCron: '' });

  const handleCreate = () => {
    createRoutine.mutate(
      {
        companyId,
        name: formData.name,
        description: formData.description || undefined,
        triggerCron: formData.triggerCron || undefined,
        enabled: true,
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          setFormData({ name: '', description: '', triggerCron: '' });
        },
      },
    );
  };

  const allRoutines = routines ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <h1 className="text-xl font-semibold">Routines</h1>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          New Routine
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="text-muted-foreground">Loading routines...</div>
        ) : allRoutines.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Timer className="h-12 w-12 opacity-40" />
            <p>No routines yet. Create your first routine.</p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Trigger</TableHead>
                  <TableHead className="hidden sm:table-cell">Schedule</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Last Run</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allRoutines.map((routine) => (
                  <TableRow key={routine.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{routine.name}</span>
                        {routine.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {routine.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {routine.triggerCron ? (
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{routine.triggerCron}</code>
                      ) : (
                        <span className="text-muted-foreground text-xs">Manual</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {routine.triggerCron ? describeCron(routine.triggerCron) : '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={routine.enabled ? 'success' : 'secondary'}>
                        {routine.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {routine.lastRunAt ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(routine.lastRunAt).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Routine</DialogTitle>
            <DialogDescription>Set up a recurring task for agents.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="routine-name">Name</Label>
              <Input
                id="routine-name"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                placeholder="Daily code review"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="routine-desc">Description</Label>
              <Textarea
                id="routine-desc"
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="routine-cron">Cron Expression</Label>
              <Input
                id="routine-cron"
                value={formData.triggerCron}
                onChange={(e) => setFormData((f) => ({ ...f, triggerCron: e.target.value }))}
                placeholder="0 9 * * 1-5"
              />
              {formData.triggerCron && (
                <p className="text-xs text-muted-foreground">
                  → {describeCron(formData.triggerCron)}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!formData.name || createRoutine.isPending}>
              {createRoutine.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
