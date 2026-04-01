/**
 * Portability routes — Export/Import company data.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@ghostwork/db';
import { portabilityService, type ConflictStrategy, type ExportPackage } from '../services/portability.js';

export const portabilityRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;
  const svc = portabilityService(db);

  // Preview export
  app.post<{ Params: { companyId: string } }>(
    '/companies/:companyId/exports/preview',
    async (request) => {
      const { companyId } = request.params;
      return svc.previewExport(companyId);
    },
  );

  // Execute export
  app.post<{ Params: { companyId: string } }>(
    '/companies/:companyId/exports',
    async (request) => {
      const { companyId } = request.params;
      return svc.exportCompany(companyId);
    },
  );

  // Preview import
  app.post('/imports/preview', async (request) => {
    const data = request.body as ExportPackage;
    return svc.previewImport(data);
  });

  // Execute import
  app.post('/imports', async (request) => {
    const body = request.body as { data: ExportPackage; strategy?: ConflictStrategy };
    return svc.importCompany(body.data, body.strategy);
  });
};
