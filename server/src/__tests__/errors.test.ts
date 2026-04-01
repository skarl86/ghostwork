import { describe, it, expect } from 'vitest';
import {
  NotFoundError,
  UnprocessableError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  ApiError,
} from '../errors.js';

describe('Custom error classes', () => {
  it('NotFoundError has correct properties', () => {
    const err = new NotFoundError('Item not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Item not found');
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
  });

  it('UnprocessableError has correct properties', () => {
    const err = new UnprocessableError('Invalid input', { field: 'name' });
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('UNPROCESSABLE_ENTITY');
    expect(err.details).toEqual({ field: 'name' });
  });

  it('ConflictError has correct properties', () => {
    const err = new ConflictError('Already exists');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });

  it('UnauthorizedError has correct properties', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('ForbiddenError has correct properties', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });
});
