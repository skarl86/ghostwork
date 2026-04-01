/**
 * Test helpers — build a test app with a mock or real DB.
 */

import type { Db } from '@ghostwork/db';
import type { AppConfig } from '../config.js';
import { buildApp } from '../app.js';

export const defaultTestConfig: AppConfig = {
  port: 3100,
  host: '127.0.0.1',
  mode: 'local_trusted',
  logLevel: 'silent',
  isDev: false,
  migrationAutoApply: false,
};

export async function buildTestApp(db: Db, configOverrides?: Partial<AppConfig>) {
  const config = { ...defaultTestConfig, ...configOverrides };
  const app = await buildApp(db, config);
  return app;
}
