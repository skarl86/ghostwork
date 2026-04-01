import { createContext, useContext, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { useCompany } from '@/hooks/queries';
import type { Company } from '@/lib/api';

interface CompanyContextValue {
  companyId: string;
  company: Company | undefined;
  isLoading: boolean;
}

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { companyId } = useParams<{ companyId: string }>();
  const { data: company, isLoading } = useCompany(companyId ?? '');

  if (!companyId) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">No company selected</div>;
  }

  return (
    <CompanyContext.Provider value={{ companyId, company, isLoading }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompanyContext() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompanyContext must be used within CompanyProvider');
  return ctx;
}
