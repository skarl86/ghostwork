import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { CommandPalette } from '@/components/CommandPalette';
import { CompanyProvider } from '@/providers/CompanyProvider';
import { LiveUpdatesProvider } from '@/providers/LiveUpdatesProvider';

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      Loading...
    </div>
  );
}

export function AppLayout() {
  return (
    <CompanyProvider>
      <LiveUpdatesProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-auto pb-14 md:pb-0">
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </main>
          <MobileBottomNav />
          <CommandPalette />
        </div>
      </LiveUpdatesProvider>
    </CompanyProvider>
  );
}
