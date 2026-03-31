/**
 * @paperclip/server — Fastify API server entry point
 */

import { buildApp } from './app.js';

const PORT = Number(process.env['PAPERCLIP_PORT'] ?? 3100);
const HOST = process.env['PAPERCLIP_HOST'] ?? '127.0.0.1';

async function main(): Promise<void> {
  const app = await buildApp();

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`Server listening on ${HOST}:${PORT}`);
}

main().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
