/**
 * Result type for business logic — no throwing, explicit error handling.
 *
 * Usage:
 *   const result = ok(42);
 *   const error = err(AppError.create('SOME_ERROR', 'Something went wrong'));
 *
 *   if (result.ok) {
 *     console.log(result.value); // 42
 *   } else {
 *     console.log(result.error); // AppError
 *   }
 */

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/**
 * Unwrap a Result — throws if Err. Use only in tests or at top-level boundaries.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw new Error(`Próba unwrap na Err: ${String(result.error)}`);
}
