import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr, unwrap } from './result.ts';
import type { Result } from './result.ts';

describe('Result type', () => {
  describe('ok()', () => {
    it('creates an Ok result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
    });

    it('works with complex types', () => {
      const result = ok({ name: 'test', count: 5 });
      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ name: 'test', count: 5 });
    });
  });

  describe('err()', () => {
    it('creates an Err result', () => {
      const result = err('something went wrong');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('something went wrong');
    });
  });

  describe('isOk() / isErr()', () => {
    it('correctly narrows Ok type', () => {
      const result: Result<number, string> = ok(10);
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
    });

    it('correctly narrows Err type', () => {
      const result: Result<number, string> = err('fail');
      expect(isOk(result)).toBe(false);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('unwrap()', () => {
    it('returns value for Ok', () => {
      expect(unwrap(ok('hello'))).toBe('hello');
    });

    it('throws for Err', () => {
      expect(() => unwrap(err('bad'))).toThrow('Próba unwrap na Err');
    });
  });
});
