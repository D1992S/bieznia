import { describe, it, expect } from 'vitest';
import { AppError } from './app-error.ts';

describe('AppError', () => {
  describe('create()', () => {
    it('creates an error with default severity', () => {
      const error = AppError.create('TEST_ERROR', 'Test message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test message');
      expect(error.severity).toBe('error');
      expect(error.context).toEqual({});
      expect(error.timestamp).toBeDefined();
    });

    it('creates an error with context', () => {
      const error = AppError.create('DB_ERROR', 'Query failed', 'error', {
        table: 'users',
        query: 'SELECT *',
      });
      expect(error.context).toEqual({ table: 'users', query: 'SELECT *' });
    });

    it('preserves cause message', () => {
      const cause = new Error('original error');
      const error = AppError.create('WRAPPED', 'Wrapper', 'error', undefined, cause);
      expect(error.cause).toBe('original error');
    });
  });

  describe('factory methods', () => {
    it('fatal() sets severity to fatal', () => {
      const error = AppError.fatal('CRASH', 'System crashed');
      expect(error.severity).toBe('fatal');
    });

    it('warning() sets severity to warning', () => {
      const error = AppError.warning('SLOW_QUERY', 'Query took >100ms');
      expect(error.severity).toBe('warning');
    });

    it('info() sets severity to info', () => {
      const error = AppError.info('CACHE_MISS', 'Cache miss for key X');
      expect(error.severity).toBe('info');
    });
  });

  describe('serialization', () => {
    it('toDTO() and fromDTO() round-trip', () => {
      const original = AppError.create('ROUND_TRIP', 'Test round trip', 'warning', {
        key: 'value',
      });
      const dto = original.toDTO();
      const restored = AppError.fromDTO(dto);

      expect(restored.code).toBe(original.code);
      expect(restored.message).toBe(original.message);
      expect(restored.severity).toBe(original.severity);
      expect(restored.context).toEqual(original.context);
    });
  });

  describe('toString()', () => {
    it('formats error as string', () => {
      const error = AppError.create('MY_CODE', 'Something happened', 'error');
      expect(error.toString()).toBe('[ERROR] MY_CODE: Something happened');
    });
  });
});
