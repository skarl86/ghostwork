/**
 * Application configuration — loaded from environment variables with Zod validation.
 */

import { z } from 'zod';

const configSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3100),
  host: z.string().default('127.0.0.1'),
  databaseUrl: z.string().optional(),
  mode: z.enum(['local_trusted', 'authenticated']).default('local_trusted'),
  agentJwtSecret: z.string().optional(),
  migrationAutoApply: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  logLevel: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  isDev: z.boolean().default(false),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(): AppConfig {
  const raw = {
    port: process.env['GHOSTWORK_PORT'],
    host: process.env['GHOSTWORK_HOST'],
    databaseUrl: process.env['DATABASE_URL'] || undefined,
    mode: process.env['GHOSTWORK_MODE'],
    agentJwtSecret: process.env['GHOSTWORK_AGENT_JWT_SECRET'] || undefined,
    migrationAutoApply: process.env['GHOSTWORK_MIGRATION_AUTO_APPLY'],
    logLevel: process.env['GHOSTWORK_LOG_LEVEL'],
    isDev: process.env['NODE_ENV'] !== 'production',
  };

  return configSchema.parse(raw);
}
