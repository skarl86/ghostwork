/**
 * @paperclip/shared — Shared types and utilities
 */

export interface Result<T, E = Error> {
  ok: boolean;
  data?: T;
  error?: E;
}

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<E = Error>(error: E): Result<never, E> {
  return { ok: false, error };
}
