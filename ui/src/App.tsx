import { lazy, useState, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { AppToastProvider } from '@/providers/ToastProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppLayout } from '@/components/layout/AppLayout';
import { Home } from '@/pages/Home';

// Code-split page components
const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const AgentList = lazy(() => import('@/pages/AgentList').then((m) => ({ default: m.AgentList })));
const AgentDetail = lazy(() => import('@/pages/AgentDetail').then((m) => ({ default: m.AgentDetail })));
const IssueList = lazy(() => import('@/pages/IssueList').then((m) => ({ default: m.IssueList })));
const IssueDetail = lazy(() => import('@/pages/IssueDetail').then((m) => ({ default: m.IssueDetail })));
const Goals = lazy(() => import('@/pages/Goals').then((m) => ({ default: m.Goals })));
const OrgChart = lazy(() => import('@/pages/OrgChart').then((m) => ({ default: m.OrgChart })));
const Routines = lazy(() => import('@/pages/Routines').then((m) => ({ default: m.Routines })));
const Approvals = lazy(() => import('@/pages/Approvals').then((m) => ({ default: m.Approvals })));
const Budgets = lazy(() => import('@/pages/Budgets').then((m) => ({ default: m.Budgets })));
const Costs = lazy(() => import('@/pages/Costs').then((m) => ({ default: m.Costs })));
const CompanySettings = lazy(() => import('@/pages/CompanySettings').then((m) => ({ default: m.CompanySettings })));
const Secrets = lazy(() => import('@/pages/Secrets').then((m) => ({ default: m.Secrets })));
const Projects = lazy(() => import('@/pages/Projects').then((m) => ({ default: m.Projects })));

function PageFallback() {
  return <div className="flex h-full items-center justify-center text-muted-foreground">Loading...</div>;
}

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppToastProvider>
          <ErrorBoundary>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/:companyId" element={<AppLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
                <Route path="agents" element={<Suspense fallback={<PageFallback />}><AgentList /></Suspense>} />
                <Route path="agents/:agentId" element={<Suspense fallback={<PageFallback />}><AgentDetail /></Suspense>} />
                <Route path="issues" element={<Suspense fallback={<PageFallback />}><IssueList /></Suspense>} />
                <Route path="issues/:issueId" element={<Suspense fallback={<PageFallback />}><IssueDetail /></Suspense>} />
                <Route path="projects" element={<Suspense fallback={<PageFallback />}><Projects /></Suspense>} />
                <Route path="goals" element={<Suspense fallback={<PageFallback />}><Goals /></Suspense>} />
                <Route path="org-chart" element={<Suspense fallback={<PageFallback />}><OrgChart /></Suspense>} />
                <Route path="routines" element={<Suspense fallback={<PageFallback />}><Routines /></Suspense>} />
                <Route path="approvals" element={<Suspense fallback={<PageFallback />}><Approvals /></Suspense>} />
                <Route path="budgets" element={<Suspense fallback={<PageFallback />}><Budgets /></Suspense>} />
                <Route path="costs" element={<Suspense fallback={<PageFallback />}><Costs /></Suspense>} />
                <Route path="settings" element={<Suspense fallback={<PageFallback />}><CompanySettings /></Suspense>} />
                <Route path="settings/secrets" element={<Suspense fallback={<PageFallback />}><Secrets /></Suspense>} />
              </Route>
            </Routes>
          </BrowserRouter>
          </ErrorBoundary>
        </AppToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
