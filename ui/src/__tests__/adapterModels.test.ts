import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queryKeys } from '../hooks/queries';

describe('adapterModels queryKey', () => {
  it('includes the adapter type', () => {
    expect(queryKeys.adapterModels('claude-local')).toEqual([
      'adapterModels',
      'claude-local',
    ]);
  });

  it('produces different keys for different adapters', () => {
    const key1 = queryKeys.adapterModels('claude-local');
    const key2 = queryKeys.adapterModels('gemini-local');
    expect(key1).not.toEqual(key2);
  });

  it('handles empty string adapter type', () => {
    expect(queryKeys.adapterModels('')).toEqual(['adapterModels', '']);
  });
});

describe('fetchAdapterModels', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('calls the correct URL with encoded adapter type', async () => {
    const models = [
      { id: 'model-1', name: 'Model 1', provider: 'test' },
    ];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ models }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { fetchAdapterModels } = await import('../lib/api');

    const result = await fetchAdapterModels('claude-local');

    expect(result).toEqual({ models });
    expect(mockFetch).toHaveBeenCalledOnce();

    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('/adapters/claude-local/models');
  });

  it('encodes special characters in adapter type', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ models: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { fetchAdapterModels } = await import('../lib/api');

    await fetchAdapterModels('my adapter/type');

    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('/adapters/my%20adapter%2Ftype/models');
  });

  it('throws ApiError on server error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('no json')),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { fetchAdapterModels, ApiError } = await import('../lib/api');

    await expect(fetchAdapterModels('claude-local')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError on 404 for unknown adapter', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ error: 'Adapter "unknown" not found' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { fetchAdapterModels } = await import('../lib/api');

    await expect(fetchAdapterModels('unknown')).rejects.toThrow('API Error: 404 Not Found');
  });
});
