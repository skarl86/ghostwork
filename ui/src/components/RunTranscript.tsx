/**
 * RunTranscriptView — displays agent execution log
 * Maps server schema (kind/payload) to UI display format
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRunEvents } from '@/hooks/queries';
import type { RunEvent } from '@/lib/api';

interface TranscriptEntry {
  id: string;
  type: string;
  content?: string | null;
  metadata?: unknown;
  createdAt: string;
}

function mapEventToEntry(e: RunEvent): TranscriptEntry {
  const payload = e.payload;
  let type: string = e.kind;
  let content: string | null = null; // eslint-disable-line no-useless-assignment

  if (e.kind === 'log' && payload) {
    type = (payload.stream as string) === 'stderr' ? 'stderr' : 'stdout';
    content = (payload.chunk as string) ?? null;
  } else if (e.kind === 'completed' && payload) {
    type = 'result';
    content = (payload.summary as string) ?? `Status: ${(payload.status as string) ?? 'unknown'}`;
  } else if (e.kind === 'started') {
    type = 'system';
    content = 'Run started';
  } else if (e.kind === 'failed') {
    type = 'stderr';
    content = payload ? JSON.stringify(payload) : 'Run failed';
  } else {
    content = payload ? JSON.stringify(payload) : null;
  }

  return { id: e.id, type, content, metadata: payload, createdAt: e.createdAt };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function EntryIcon({ type }: { type: string }) {
  const colors: Record<string, string> = {
    assistant: 'text-blue-500',
    user: 'text-green-500',
    thinking: 'text-purple-500',
    tool_call: 'text-orange-500',
    tool_result: 'text-orange-400',
    system: 'text-gray-500',
    stdout: 'text-foreground',
    stderr: 'text-red-500',
    init: 'text-gray-400',
    result: 'text-cyan-500',
  };
  return <span className={cn('inline-block w-2 h-2 rounded-full', colors[type] ?? 'text-gray-400', 'bg-current')} />;
}

function TranscriptLine({ entry }: { entry: TranscriptEntry }) {
  const [expanded, setExpanded] = useState(entry.type !== 'tool_call' && entry.type !== 'tool_result');
  const isCollapsible = entry.type === 'tool_call' || entry.type === 'tool_result';

  return (
    <div className="group flex gap-2 py-1 px-2 hover:bg-muted/50 rounded text-sm font-mono">
      <span className="shrink-0 text-muted-foreground text-xs w-20">{formatTime(entry.createdAt)}</span>
      <EntryIcon type={entry.type} />
      <div className="flex-1 min-w-0">
        {isCollapsible ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span className="text-xs uppercase">{entry.type.replace('_', ' ')}</span>
          </button>
        ) : (
          <span className="text-xs uppercase text-muted-foreground">{entry.type.replace('_', ' ')}</span>
        )}
        {(!isCollapsible || expanded) && entry.content && (
          <pre className="mt-1 whitespace-pre-wrap break-words text-foreground">{entry.content}</pre>
        )}
      </div>
    </div>
  );
}

export function RunTranscriptView({ runId }: { runId: string }) {
  const { data: rawEvents, isLoading } = useRunEvents(runId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Map server events (kind/payload) to UI entries (type/content)
  const events = rawEvents?.map((e) => mapEventToEntry(e));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading transcript...</div>;
  }

  if (!events || events.length === 0) {
    return <div className="p-4 text-muted-foreground">No events recorded for this run.</div>;
  }

  return (
    <div ref={scrollRef} className="max-h-[600px] overflow-auto rounded-md border bg-background">
      {events.map((e) => (
        <TranscriptLine key={e.id} entry={e} />
      ))}
    </div>
  );
}
