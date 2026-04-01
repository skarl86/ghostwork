/**
 * Environment variable utilities for adapters.
 */

import type { AdapterExecutionContext } from '../types.js';

/**
 * Build GHOSTWORK_* environment variables from execution context.
 */
export function buildContextSnapshot(
  ctx: AdapterExecutionContext,
): Record<string, string> {
  const env: Record<string, string> = {
    GHOSTWORK_RUN_ID: ctx.runId,
    GHOSTWORK_AGENT_ID: ctx.agent.id,
    GHOSTWORK_COMPANY_ID: ctx.agent.companyId,
    GHOSTWORK_TASK_KEY: ctx.runtime.taskKey,
  };

  if (ctx.authToken) {
    env['GHOSTWORK_AUTH_TOKEN'] = ctx.authToken;
  }

  // Pass through any existing GHOSTWORK_* env vars from the context
  for (const [key, value] of Object.entries(ctx.context)) {
    if (typeof value === 'string') {
      env[`GHOSTWORK_CTX_${key.toUpperCase()}`] = value;
    }
  }

  return env;
}
