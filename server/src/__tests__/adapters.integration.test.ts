import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createAdapterRegistry,
  createMockAdapter,
  type ServerAdapterModule,
  type AdapterModel,
} from '@ghostwork/adapters';
import { buildApp } from '../app.js';
import { getTestDb, cleanupTestDb } from './setup.js';
import type { Db } from '@ghostwork/db';
import type { AppConfig } from '../config.js';

const testConfig: AppConfig = {
  port: 3100,
  host: '127.0.0.1',
  mode: 'local_trusted',
  logLevel: 'silent',
  isDev: false,
  migrationAutoApply: false,
};

describe('GET /api/adapters/:adapterType/models', () => {
  let db: Db;

  beforeAll(() => {
    db = getTestDb();
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  it('returns static models for an adapter with models array', async () => {
    const models: AdapterModel[] = [
      { id: 'model-a', name: 'Model A', provider: 'test-provider' },
      { id: 'model-b', name: 'Model B', provider: 'test-provider' },
    ];
    const adapter: ServerAdapterModule = {
      ...createMockAdapter(),
      type: 'test-static',
      models,
    };
    const registry = createAdapterRegistry([adapter]);
    const app = await buildApp(db, testConfig, undefined, undefined, registry);

    const res = await app.inject({
      method: 'GET',
      url: '/api/adapters/test-static/models',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.models).toEqual(models);

    await app.close();
  });

  it('returns empty array for adapter without models', async () => {
    const adapter = createMockAdapter();
    const registry = createAdapterRegistry([adapter]);
    const app = await buildApp(db, testConfig, undefined, undefined, registry);

    const res = await app.inject({
      method: 'GET',
      url: '/api/adapters/mock/models',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.models).toEqual([]);

    await app.close();
  });

  it('prefers listModels() over static models array', async () => {
    const staticModels: AdapterModel[] = [
      { id: 'static-1', name: 'Static', provider: 'test' },
    ];
    const dynamicModels: AdapterModel[] = [
      { id: 'dynamic-1', name: 'Dynamic A', provider: 'test' },
      { id: 'dynamic-2', name: 'Dynamic B', provider: 'test' },
    ];
    const adapter: ServerAdapterModule = {
      ...createMockAdapter(),
      type: 'test-dynamic',
      models: staticModels,
      listModels: async () => dynamicModels,
    };
    const registry = createAdapterRegistry([adapter]);
    const app = await buildApp(db, testConfig, undefined, undefined, registry);

    const res = await app.inject({
      method: 'GET',
      url: '/api/adapters/test-dynamic/models',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.models).toEqual(dynamicModels);

    await app.close();
  });

  it('returns 404 for unknown adapter type', async () => {
    const registry = createAdapterRegistry();
    const app = await buildApp(db, testConfig, undefined, undefined, registry);

    const res = await app.inject({
      method: 'GET',
      url: '/api/adapters/nonexistent/models',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain('nonexistent');

    await app.close();
  });
});
