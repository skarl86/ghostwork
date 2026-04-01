import EmbeddedPostgres from 'embedded-postgres';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let instance: EmbeddedPostgres | null = null;

export interface EmbeddedPgResult {
  url: string;
  stop: () => Promise<void>;
}

/**
 * Starts an embedded PostgreSQL instance if DATABASE_URL is not set.
 * Returns the connection URL and a stop function for cleanup.
 */
export async function getConnectionUrl(options?: {
  port?: number;
  persistent?: boolean;
}): Promise<EmbeddedPgResult> {
  const envUrl = process.env['DATABASE_URL'];
  if (envUrl) {
    return {
      url: envUrl,
      stop: async () => {
        /* external DB — nothing to stop */
      },
    };
  }

  const port = options?.port ?? 15432;
  const persistent = options?.persistent ?? true;
  const url = `postgresql://postgres:postgres@localhost:${port}/ghostwork`;

  if (instance) {
    return {
      url,
      stop: async () => {
        await instance?.stop();
        instance = null;
      },
    };
  }

  const dataDir = path.resolve(__dirname, '..', '.embedded-pg');
  const isInitialized = fs.existsSync(path.join(dataDir, 'PG_VERSION'));

  instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent,
  });

  if (!isInitialized) {
    await instance.initialise();
  }

  await instance.start();

  try {
    await instance.createDatabase('ghostwork');
  } catch {
    // Database may already exist — ignore
  }

  return {
    url,
    stop: async () => {
      await instance?.stop();
      instance = null;
    },
  };
}
