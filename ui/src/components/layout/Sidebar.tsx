import { Link, useLocation, useNavigate } from 'react-router';
import {
  LayoutDashboard, Bot, KanbanSquare, FolderKanban, Target, Network, Timer,
  ShieldCheck, Wallet, DollarSign, Settings, ChevronDown, Plus,
  Moon, Sun, PanelLeftClose, PanelLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCompanyContext } from '@/providers/CompanyProvider';
import { useCompanies } from '@/hooks/queries';
import { useTheme } from '@/providers/ThemeProvider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useState } from 'react';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: 'dashboard' },
  { label: 'Agents', icon: Bot, path: 'agents' },
  { label: 'Issues', icon: KanbanSquare, path: 'issues' },
  { label: 'Projects', icon: FolderKanban, path: 'projects' },
  { label: 'Goals', icon: Target, path: 'goals' },
  { label: 'Org Chart', icon: Network, path: 'org-chart' },
  { label: 'Routines', icon: Timer, path: 'routines' },
  { label: 'Approvals', icon: ShieldCheck, path: 'approvals' },
  { label: 'Budgets', icon: Wallet, path: 'budgets' },
  { label: 'Costs', icon: DollarSign, path: 'costs' },
  { label: 'Settings', icon: Settings, path: 'settings' },
];

export function Sidebar() {
  const { companyId, company } = useCompanyContext();
  const { data: companies } = useCompanies();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'hidden md:flex h-screen flex-col border-r bg-card transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Company Switcher */}
      <div className="flex items-center gap-2 border-b p-4">
        {!collapsed && (companies && companies.length <= 1 ? (
          <span className="flex-1 truncate px-3 py-2 text-sm font-medium">{company?.name ?? 'Loading...'}</span>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex-1 justify-between truncate">
                <span className="truncate">{company?.name ?? 'Loading...'}</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {companies?.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onClick={() => void navigate(`/${c.id}/dashboard`)}
                  className={cn(c.id === companyId && 'bg-accent')}
                >
                  {c.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void navigate('/')}>
                <Plus className="mr-2 h-4 w-4" />
                New Company
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} className="shrink-0">
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {navItems.map((item) => {
          const href = `/${companyId}/${item.path}`;
          const isActive =
            item.path === 'dashboard'
              ? location.pathname === href || location.pathname === `/${companyId}`
              : location.pathname.startsWith(href);
          return (
            <Link
              key={item.path}
              to={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[36px]',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                collapsed && 'justify-center px-2',
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Theme Toggle */}
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'default'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className={cn('w-full', !collapsed && 'justify-start gap-3')}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </Button>
      </div>
    </aside>
  );
}
