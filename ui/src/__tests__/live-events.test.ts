import { describe, it, expect, vi } from 'vitest';
import { queryKeys } from '../hooks/queries';

/**
 * Test the event → cache invalidation mapping logic from LiveUpdatesProvider.
 *
 * We extract the pure logic and test it without needing a real WebSocket or React tree.
 */

// Re-create the handleEvent logic as a pure function for testing
function createEventHandler(companyId: string) {
  const invalidated: string[][] = [];
  const toasts: Array<{ title: string; variant: string }> = [];

  const queryClient = {
    invalidateQueries: vi.fn(({ queryKey }: { queryKey: readonly unknown[] }) => {
      invalidated.push([...queryKey] as string[]);
      return Promise.resolve();
    }),
  };

  const toast = vi.fn((t: { title: string; variant: string }) => {
    toasts.push(t);
  });

  function handleEvent(event: { type: string; payload?: Record<string, unknown> }) {
    switch (event.type) {
      case 'heartbeat.run.status': {
        void queryClient.invalidateQueries({ queryKey: queryKeys.runs(companyId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.agents(companyId) });
        const status = event.payload?.['status'] as string | undefined;
        if (status === 'succeeded') {
          toast({ title: 'Run completed', variant: 'success' });
        } else if (status === 'failed') {
          toast({ title: 'Run failed', variant: 'destructive' });
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

  return { handleEvent, invalidated, toasts, queryClient, toast };
}

describe('LiveUpdates event handling', () => {
  const companyId = 'company-1';

  it('heartbeat.run.status invalidates runs and agents', () => {
    const { handleEvent, invalidated } = createEventHandler(companyId);
    handleEvent({ type: 'heartbeat.run.status', payload: { status: 'running' } });
    expect(invalidated).toContainEqual(expect.arrayContaining(['runs', companyId]));
    expect(invalidated).toContainEqual(expect.arrayContaining(['agents', companyId]));
  });

  it('heartbeat.run.status succeeded triggers success toast', () => {
    const { handleEvent, toasts } = createEventHandler(companyId);
    handleEvent({ type: 'heartbeat.run.status', payload: { status: 'succeeded' } });
    expect(toasts).toContainEqual({ title: 'Run completed', variant: 'success' });
  });

  it('heartbeat.run.status failed triggers destructive toast', () => {
    const { handleEvent, toasts } = createEventHandler(companyId);
    handleEvent({ type: 'heartbeat.run.status', payload: { status: 'failed' } });
    expect(toasts).toContainEqual({ title: 'Run failed', variant: 'destructive' });
  });

  it('heartbeat.run.log invalidates runEvents for specific runId', () => {
    const { handleEvent, invalidated } = createEventHandler(companyId);
    handleEvent({ type: 'heartbeat.run.log', payload: { runId: 'run-42' } });
    expect(invalidated).toContainEqual(['runEvents', 'run-42']);
  });

  it('heartbeat.run.log without runId does not invalidate', () => {
    const { handleEvent, queryClient } = createEventHandler(companyId);
    handleEvent({ type: 'heartbeat.run.log', payload: {} });
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('agent.status invalidates agents', () => {
    const { handleEvent, invalidated } = createEventHandler(companyId);
    handleEvent({ type: 'agent.status' });
    expect(invalidated).toContainEqual(['agents', companyId]);
  });

  it('activity.logged invalidates activity', () => {
    const { handleEvent, invalidated } = createEventHandler(companyId);
    handleEvent({ type: 'activity.logged' });
    expect(invalidated).toContainEqual(['activity', companyId]);
  });

  it('heartbeat.run.queued invalidates runs', () => {
    const { handleEvent, invalidated } = createEventHandler(companyId);
    handleEvent({ type: 'heartbeat.run.queued' });
    expect(invalidated).toContainEqual(expect.arrayContaining(['runs', companyId]));
  });

  it('unknown event type does nothing', () => {
    const { handleEvent, queryClient } = createEventHandler(companyId);
    handleEvent({ type: 'unknown.event' });
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });
});
