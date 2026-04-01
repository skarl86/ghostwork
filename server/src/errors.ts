/**
 * Custom error classes and Fastify error handler.
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

// ── Base Error ──

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Concrete Errors ──

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(404, 'NOT_FOUND', message, details);
    this.name = 'NotFoundError';
  }
}

export class UnprocessableError extends ApiError {
  constructor(message = 'Unprocessable entity', details?: unknown) {
    super(422, 'UNPROCESSABLE_ENTITY', message, details);
    this.name = 'UnprocessableError';
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Resource conflict', details?: unknown) {
    super(409, 'CONFLICT', message, details);
    this.name = 'ConflictError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized', details?: unknown) {
    super(401, 'UNAUTHORIZED', message, details);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(403, 'FORBIDDEN', message, details);
    this.name = 'ForbiddenError';
  }
}

// ── Error Handler ──

export function errorHandler(
  error: FastifyError | ApiError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  // Custom API errors
  if (error instanceof ApiError) {
    return reply.code(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined && { details: error.details }),
      },
    });
  }

  // Fastify validation errors
  if ('validation' in error && (error as FastifyError).validation) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: (error as FastifyError).validation,
      },
    });
  }

  // Unexpected errors
  request.log.error(error);
  return reply.code(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
}
