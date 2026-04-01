/**
 * Reusable preHandler hook — throws UnauthorizedError if no valid actor.
 */

import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../errors.js';

/**
 * Pre-handler that ensures a valid actor is present on the request.
 * Use as a preHandler hook on routes that require authentication.
 */
export async function requireActor(request: FastifyRequest): Promise<void> {
  if (!request.actor || request.actor.type === 'none') {
    throw new UnauthorizedError();
  }
}
