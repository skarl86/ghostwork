/**
 * Unit tests for the CLI API client.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApiClient, ApiClientError } from './api-client.js';

describe('ApiClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const config = { apiUrl: 'http://localhost:3100', mode: 'local_trusted' };

  function mockFetch(data: unknown, status = 200) {
    const fn = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => data,
      text: async () => JSON.stringify(data),
    });
    globalThis.fetch = fn;
    return fn;
  }

  it('createCompany sends POST /api/companies', async () => {
    const fetchMock = mockFetch({ id: '123', name: 'TestCo' }, 201);
    const client = createApiClient(config);

    const result = await client.createCompany('TestCo', 'desc');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3100/api/companies');
    expect((opts as RequestInit).method).toBe('POST');
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({
      name: 'TestCo',
      description: 'desc',
    });
    expect(result).toEqual({ id: '123', name: 'TestCo' });
  });

  it('listCompanies sends GET /api/companies', async () => {
    const fetchMock = mockFetch([{ id: '1', name: 'Co1' }]);
    const client = createApiClient(config);

    const result = await client.listCompanies();

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3100/api/companies');
    expect(result).toEqual([{ id: '1', name: 'Co1' }]);
  });

  it('createAgent sends POST /api/agents', async () => {
    const fetchMock = mockFetch({ id: 'a1', name: 'Bot' }, 201);
    const client = createApiClient(config);

    await client.createAgent('c1', 'Bot', 'process');

    const [, opts] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({
      companyId: 'c1',
      name: 'Bot',
      adapterType: 'process',
    });
  });

  it('listAgents includes companyId query param', async () => {
    const fetchMock = mockFetch([]);
    const client = createApiClient(config);

    await client.listAgents('c1');

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3100/api/agents?companyId=c1');
  });

  it('wakeup sends POST /api/heartbeat/wakeup', async () => {
    const fetchMock = mockFetch({ runId: 'r1', coalesced: false, deferred: false }, 201);
    const client = createApiClient(config);

    await client.wakeup('c1', 'a1');

    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3100/api/heartbeat/wakeup');
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({
      companyId: 'c1',
      agentId: 'a1',
      reason: 'manual',
    });
  });

  it('throws ApiClientError on non-ok response', async () => {
    mockFetch({ error: 'not found' }, 404);
    const client = createApiClient(config);

    await expect(client.listCompanies()).rejects.toThrow(ApiClientError);
  });
});
