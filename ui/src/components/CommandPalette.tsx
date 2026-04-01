import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useSearch } from '@/hooks/queries';
import { useCompanyContext } from '@/providers/CompanyProvider';
import { Bot, KanbanSquare, FolderOpen, Target, Search, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SearchResult } from '@/lib/api';

const RECENT_KEY = 'commandPalette:recent';
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function addRecentSearch(query: string) {
  const recent = getRecentSearches().filter((q) => q !== query);
  recent.unshift(query);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

function resultIcon(type: SearchResult['type']) {
  switch (type) {
    case 'agent': return <Bot className="h-4 w-4" />;
    case 'issue': return <KanbanSquare className="h-4 w-4" />;
    case 'project': return <FolderOpen className="h-4 w-4" />;
    case 'goal': return <Target className="h-4 w-4" />;
  }
}

function resultPath(companyId: string, result: SearchResult): string {
  switch (result.type) {
    case 'agent': return `/${companyId}/agents/${result.id}`;
    case 'issue': return `/${companyId}/issues/${result.id}`;
    case 'project': return `/${companyId}/projects/${result.id}`;
    case 'goal': return `/${companyId}/goals/${result.id}`;
  }
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  let companyId = '';
  try {
    const ctx = useCompanyContext();
    companyId = ctx.companyId;
  } catch {
    // Not within a company route — palette is a no-op
  }

  const { data: results } = useSearch(companyId, query);
  const items = results ?? [];

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      // Focus after animation
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Clamp selection
  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      if (query) addRecentSearch(query);
      setOpen(false);
      void navigate(resultPath(companyId, result));
    },
    [companyId, navigate, query],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && items[selectedIndex]) {
        e.preventDefault();
        handleSelect(items[selectedIndex]);
      }
    },
    [items, selectedIndex, handleSelect],
  );

  const recentSearches = getRecentSearches();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[20%] z-50 w-full max-w-lg translate-x-[-50%] rounded-xl border bg-background shadow-2xl"
          onKeyDown={handleKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">Command Palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search across agents, issues, projects, and goals
          </DialogPrimitive.Description>
          {/* Search Input */}
          <div className="flex items-center border-b px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents, issues, projects, goals..."
              className="flex-1 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[300px] overflow-y-auto p-2">
            {items.length > 0 ? (
              items.map((item, i) => (
                <button
                  key={`${item.type}-${item.id}`}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors min-h-[44px]',
                    i === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                  )}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className="shrink-0 text-muted-foreground">{resultIcon(item.type)}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{item.title}</span>
                    <span className="text-xs text-muted-foreground truncate block capitalize">{item.type}</span>
                  </div>
                  <span className="shrink-0 text-xs capitalize text-muted-foreground">{item.type}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                </button>
              ))
            ) : query.length >= 2 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">No results found</div>
            ) : recentSearches.length > 0 ? (
              <div>
                <p className="px-3 py-1 text-xs font-medium text-muted-foreground">Recent</p>
                {recentSearches.map((q) => (
                  <button
                    key={q}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent/50 min-h-[44px]"
                    onClick={() => setQuery(q)}
                  >
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Type to search...
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
            <span>
              <kbd className="rounded border bg-muted px-1">↑↓</kbd> navigate
              <kbd className="ml-2 rounded border bg-muted px-1">↵</kbd> select
            </span>
            <span>
              <kbd className="rounded border bg-muted px-1">⌘K</kbd> toggle
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
