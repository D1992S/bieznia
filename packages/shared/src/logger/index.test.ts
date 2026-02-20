import { describe, expect, it } from 'vitest';
import { createLogger } from './index.ts';

describe('createLogger', () => {
  it('writes structured entry with level and merged context', () => {
    const entries: unknown[] = [];
    const logger = createLogger({
      baseContext: { module: 'sync' },
      now: () => '2026-01-01T00:00:00.000Z',
      writer: (entry) => entries.push(entry),
    });

    logger.info('sync started', { runId: 'run-1' });

    expect(entries).toEqual([
      {
        timestamp: '2026-01-01T00:00:00.000Z',
        level: 'info',
        message: 'sync started',
        context: {
          module: 'sync',
          runId: 'run-1',
        },
      },
    ]);
  });

  it('supports withContext for child loggers', () => {
    const entries: unknown[] = [];
    const root = createLogger({
      baseContext: { app: 'desktop' },
      now: () => '2026-01-01T00:00:00.000Z',
      writer: (entry) => entries.push(entry),
    });

    const child = root.withContext({ profileId: 'profile-1' });
    child.warning('retry', { attempt: 2 });

    expect(entries).toEqual([
      {
        timestamp: '2026-01-01T00:00:00.000Z',
        level: 'warning',
        message: 'retry',
        context: {
          app: 'desktop',
          profileId: 'profile-1',
          attempt: 2,
        },
      },
    ]);
  });

  it('exposes all level helpers', () => {
    const levels: string[] = [];
    const logger = createLogger({
      now: () => '2026-01-01T00:00:00.000Z',
      writer: (entry) => levels.push(entry.level),
    });

    logger.debug('d');
    logger.info('i');
    logger.warning('w');
    logger.error('e');
    logger.fatal('f');

    expect(levels).toEqual(['debug', 'info', 'warning', 'error', 'fatal']);
  });
});
