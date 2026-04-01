/**
 * LiveUpdatesProvider — WebSocket connection for real-time events
 *
 * Connects to /api/companies/:companyId/events/ws
 * Exponential backoff reconnection: 1s → 2s → 4s → ... → max 30s
 * Invalidates TanStack Query cache on events
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCompanyContext } from './CompanyProvider';
import { useToast } from './ToastProvider';
import { queryKeys } from '@/hooks/queries';

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;
const TOAST_RATE_LIMIT_MS = 5_000;

export function LiveUpdatesProvider({ children }: { children: ReactNode }) {
  const { companyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastToastRef = useRef(0);

  useEffect(() => {
    if (!companyId) return;

    let stopped = false;

    function connect() {
      if (stopped) return;

      // Use the API base URL for WebSocket to handle proxy and direct connections
      const apiBase = import.meta.env.VITE_API_URL || '';
      let wsUrl: string;
      if (apiBase) {
        // Direct API URL provided — connect directly
        const base = apiBase.replace(/^http/, 'ws');
        wsUrl = `${base}/companies/${companyId}/events/ws`;
      } else {
        // Use same host (Vite proxy)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/api/companies/${companyId}/events/ws`;
      }
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = INITIAL_BACKOFF_MS;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            type: string;
            payload?: Record<string, unknown>;
          };
          handleEvent(data);
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (stopped) return;
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    function scheduleReconnect() {
      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);
      reconnectTimerRef.current = setTimeout(connect, delay);
    }

    function handleEvent(event: { type: string; payload?: Record<string, unknown> }) {
      switch (event.type) {
        case 'heartbeat.run.status': {
          void queryClient.invalidateQueries({ queryKey: queryKeys.runs(companyId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.agents(companyId) });

          const status = event.payload?.['status'] as string | undefined;
          const now = Date.now();
          if (now - lastToastRef.current >= TOAST_RATE_LIMIT_MS) {
            if (status === 'succeeded') {
              toast({ title: 'Run completed', variant: 'success' });
              lastToastRef.current = now;
            } else if (status === 'failed') {
              toast({ title: 'Run failed', variant: 'destructive' });
              lastToastRef.current = now;
            }
          }
          break;
        }

        case 'heartbeat.run.log': {
          const runId = event.payload?.['runId'] as string | undefined;
          if (runId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.runEvents(runId) });
          }
          break;
        }

        case 'agent.status':
          void queryClient.invalidateQueries({ queryKey: queryKeys.agents(companyId) });
          break;

        case 'activity.logged':
          void queryClient.invalidateQueries({ queryKey: queryKeys.activity(companyId) });
          break;

        case 'heartbeat.run.queued':
          void queryClient.invalidateQueries({ queryKey: queryKeys.runs(companyId) });
          break;
      }
    }

    connect();

    return () => {
      stopped = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [companyId, queryClient, toast]);

  return <>{children}</>;
}
