import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from '../lib/api';

// We test the ApiError class and the request function behavior by mocking fetch.

describe('ApiError', () => {
  it('has correct status, statusText, and body', () => {
    const err = new ApiError(404, 'Not Found', { detail: 'missing' });
    expect(err.status).toBe(404);
    expect(err.statusText).toBe('Not Found');
    expect(err.body).toEqual({ detail: 'missing' });
    expect(err.message).toBe('API Error: 404 Not Found');
    expect(err.name).toBe('ApiError');
    expect(err).toBeInstanceOf(Error);
  });

  it('body is optional', () => {
    const err = new ApiError(500, 'Internal Server Error');
    expect(err.body).toBeUndefined();
  });
});

describe('api client fetch behavior', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset module cache so import.meta.env is fresh
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('throws ApiError on 404 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ error: 'not found' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Re-import to pick up mocked fetch
    const { api } = await import('../lib/api');

    await expect(api.get('/test')).rejects.toThrow('API Error: 404 Not Found');
    await expect(api.get('/test')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError on 500 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('no json')),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { api } = await import('../lib/api');

    await expect(api.get('/test')).rejects.toThrow('API Error: 500 Internal Server Error');
  });

  it('returns parsed JSON on success', async () => {
    const data = { id: '1', name: 'Test' };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { api } = await import('../lib/api');

    const result = await api.get('/test');
    expect(result).toEqual(data);
  });

  it('returns undefined on 204 No Content', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    });
    vi.stubGlobal('fetch', mockFetch);

    const { api } = await import('../lib/api');

    const result = await api.delete('/test');
    expect(result).toBeUndefined();
  });
});
