import { fileURLToPath } from 'node:url';
import {
  createAnalyticsQueryCache,
  createDatabaseConnection,
  loadSeedFixtureFromFile,
  runMigrations,
  seedDatabaseFromFixture,
} from '@moze/core';
import { ok } from '@moze/shared';
import { describe, expect, it } from 'vitest';
import { getDiagnosticsHealth, runDiagnosticsRecovery } from './diagnostics-service.ts';

const fixturePath = fileURLToPath(new URL('../../../fixtures/seed-data.json', import.meta.url));

function createSeededDb() {
  const connectionResult = createDatabaseConnection();
  expect(connectionResult.ok).toBe(true);
  if (!connectionResult.ok) {
    throw new Error(connectionResult.error.message);
  }

  const migrationResult = runMigrations(connectionResult.value.db);
  expect(migrationResult.ok).toBe(true);
  if (!migrationResult.ok) {
    throw new Error(migrationResult.error.message);
  }

  const fixtureResult = loadSeedFixtureFromFile(fixturePath);
  expect(fixtureResult.ok).toBe(true);
  if (!fixtureResult.ok) {
    throw new Error(fixtureResult.error.message);
  }

  const seedResult = seedDatabaseFromFixture(connectionResult.value.db, fixtureResult.value);
  expect(seedResult.ok).toBe(true);
  if (!seedResult.ok) {
    throw new Error(seedResult.error.message);
  }

  const allDates = fixtureResult.value.channelDaily.map((row) => row.date).sort((left, right) => left.localeCompare(right));
  const dateFrom = allDates[0];
  const dateTo = allDates[allDates.length - 1];
  if (!dateFrom || !dateTo) {
    throw new Error('No data in fixture channelDaily.');
  }

  return {
    connection: connectionResult.value,
    channelId: fixtureResult.value.channel.channelId,
    dateFrom,
    dateTo,
  };
}

describe('diagnostics service integration', () => {
  it('returns diagnostics health checks for db/cache/pipeline/ipc', () => {
    let seeded: ReturnType<typeof createSeededDb> | null = null;
    try {
      seeded = createSeededDb();
      const cache = createAnalyticsQueryCache(seeded.connection.db);

      const healthResult = getDiagnosticsHealth({
        db: seeded.connection.db,
        health: {
          channelId: seeded.channelId,
          dateFrom: seeded.dateFrom,
          dateTo: seeded.dateTo,
          windowHours: 24,
        },
        dependencies: {
          readCacheSnapshot: ({ windowHours }) => cache.getPerformanceSnapshot({ windowHours }),
        },
        now: () => new Date('2026-02-17T20:00:00.000Z'),
      });

      expect(healthResult.ok).toBe(true);
      if (healthResult.ok) {
        expect(healthResult.value.checks.length).toBeGreaterThanOrEqual(4);
        expect(healthResult.value.checks.some((check) => check.checkId === 'db.integrity')).toBe(true);
        expect(healthResult.value.checks.some((check) => check.checkId === 'cache.snapshot')).toBe(true);
        expect(healthResult.value.checks.some((check) => check.checkId === 'pipeline.freshness')).toBe(true);
        expect(healthResult.value.checks.some((check) => check.checkId === 'ipc.bridge')).toBe(true);
      }
    } finally {
      if (seeded) {
        const closeResult = seeded.connection.close();
        expect(closeResult.ok).toBe(true);
      }
    }
  });

  it('runs recovery actions and returns successful status', () => {
    let seeded: ReturnType<typeof createSeededDb> | null = null;
    try {
      seeded = createSeededDb();
      const cache = createAnalyticsQueryCache(seeded.connection.db);

      const recoveryResult = runDiagnosticsRecovery({
        db: seeded.connection.db,
        recovery: {
          channelId: seeded.channelId,
          dateFrom: seeded.dateFrom,
          dateTo: seeded.dateTo,
          actions: [
            'invalidate_analytics_cache',
            'rerun_data_pipeline',
            'vacuum_database',
            'reindex_fts',
            'integrity_check',
          ],
        },
        dependencies: {
          invalidateAnalyticsCache: () => cache.invalidateAll({ reason: 'diagnostics-test' }),
          rerunDataPipeline: ({ dateTo }) =>
            ok({
              generatedFeatures: 90,
              latestFeatureDate: dateTo,
            }),
        },
        now: () => new Date('2026-02-17T20:05:00.000Z'),
      });

      expect(recoveryResult.ok).toBe(true);
      if (recoveryResult.ok) {
        expect(recoveryResult.value.overallStatus).toBe('ok');
        expect(recoveryResult.value.steps.length).toBe(5);
        expect(recoveryResult.value.steps.every((step) => step.status === 'ok')).toBe(true);
      }
    } finally {
      if (seeded) {
        const closeResult = seeded.connection.close();
        expect(closeResult.ok).toBe(true);
      }
    }
  });

  it('marks recovery as partial when optional dependencies are unavailable', () => {
    let seeded: ReturnType<typeof createSeededDb> | null = null;
    try {
      seeded = createSeededDb();

      const recoveryResult = runDiagnosticsRecovery({
        db: seeded.connection.db,
        recovery: {
          channelId: seeded.channelId,
          dateFrom: seeded.dateFrom,
          dateTo: seeded.dateTo,
          actions: ['invalidate_analytics_cache', 'rerun_data_pipeline'],
        },
      });

      expect(recoveryResult.ok).toBe(true);
      if (recoveryResult.ok) {
        expect(recoveryResult.value.overallStatus).toBe('partial');
        expect(recoveryResult.value.steps.every((step) => step.status === 'skipped')).toBe(true);
      }
    } finally {
      if (seeded) {
        const closeResult = seeded.connection.close();
        expect(closeResult.ok).toBe(true);
      }
    }
  });
});
