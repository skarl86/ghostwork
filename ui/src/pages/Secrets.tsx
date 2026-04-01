import { useState } from 'react';
import { useCompanyContext } from '@/providers/CompanyProvider';
import { useSecrets, useCreateSecret, useDeleteSecret } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import { Plus, Trash2, KeyRound } from 'lucide-react';

export function Secrets() {
  const { companyId } = useCompanyContext();
  const { data: secrets, isLoading } = useSecrets(companyId);
  const createSecret = useCreateSecret();
  const deleteSecretMut = useDeleteSecret();
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({ name: '', value: '' });

  const handleCreate = () => {
    createSecret.mutate(
      { companyId, name: formData.name, value: formData.value },
      {
        onSuccess: () => {
          setShowCreate(false);
          setFormData({ name: '', value: '' });
        },
      },
    );
  };

  const allSecrets = secrets ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Secrets</h1>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          New Secret
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="text-muted-foreground">Loading secrets...</div>
        ) : allSecrets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <KeyRound className="h-12 w-12 opacity-40" />
            <p>No secrets configured. Secrets are available to agents as environment variables.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {allSecrets.map((secret) => (
                  <TableRow key={secret.id}>
                    <TableCell className="font-mono text-sm">{secret.name}</TableCell>
                    <TableCell className="text-muted-foreground">••••••••</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {new Date(secret.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteSecretMut.mutate({ id: secret.id, companyId })}
                        disabled={deleteSecretMut.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Secret</DialogTitle>
            <DialogDescription>Secrets are injected as environment variables during agent execution.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="secret-name">Name</Label>
              <Input
                id="secret-name"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                placeholder="OPENAI_API_KEY"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secret-value">Value</Label>
              <Input
                id="secret-value"
                type="password"
                value={formData.value}
                onChange={(e) => setFormData((f) => ({ ...f, value: e.target.value }))}
                placeholder="sk-..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!formData.name || !formData.value || createSecret.isPending}>
              {createSecret.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
