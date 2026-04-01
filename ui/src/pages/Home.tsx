import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useCompanies, useCreateCompany } from '@/hooks/queries';

export function Home() {
  const navigate = useNavigate();
  const { data: companies, isLoading } = useCompanies();
  const createMutation = useCreateCompany();
  const [name, setName] = useState('');

  // Redirect to first company if exists
  useEffect(() => {
    if (companies && companies.length > 0 && companies[0]) {
      void navigate(`/${companies[0].id}/dashboard`, { replace: true });
    }
  }, [companies, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // No companies exist — show creation form
  const handleCreate = () => {
    if (!name.trim()) return;
    createMutation.mutate(
      { name: name.trim() },
      {
        onSuccess: (company) => {
          void navigate(`/${company.id}/dashboard`);
        },
      },
    );
  };

  return (
    <div className="flex h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to Ghostwork</CardTitle>
          <CardDescription>Create your first company to get started.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="company-name">Company Name</Label>
            <Input
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My AI Company"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <Button onClick={handleCreate} disabled={createMutation.isPending || !name.trim()} className="w-full">
            {createMutation.isPending ? 'Creating...' : 'Create Company'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
