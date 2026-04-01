import { Link, useLocation } from 'react-router';
import { useCompanyContext } from '@/providers/CompanyProvider';
import {
  LayoutDashboard, Bot, KanbanSquare, Target, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Home', icon: LayoutDashboard, path: 'dashboard' },
  { label: 'Agents', icon: Bot, path: 'agents' },
  { label: 'Issues', icon: KanbanSquare, path: 'issues' },
  { label: 'Goals', icon: Target, path: 'goals' },
  { label: 'Settings', icon: Settings, path: 'settings' },
];

export function MobileBottomNav() {
  const { companyId } = useCompanyContext();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {navItems.map((item) => {
        const href = `/${companyId}/${item.path}`;
        const isActive = location.pathname.startsWith(href);
        return (
          <Link
            key={item.path}
            to={href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] min-h-[56px] transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
