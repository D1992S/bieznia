import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDatabaseConnection } from './database.ts';
import { loadSeedFixtureFromFile, seedDatabaseFromFixture } from './fixtures/index.ts';
import { runMigrations } from './migrations/index.ts';
import { createAnalyticsQueryCache } from './observability/analytics-query-cache.ts';
import { createMetricsQueries } from './queries/metrics-queries.ts';

const fixturePath = fileURLToPath(new URL('../../../fixtures/seed-data.json', import.meta.url));

describe('analytics query cache integration', () => {
  it('records hit/miss events, supports invalidation and exposes performance snapshot', () => {
    const fixtureResult = loadSeedFixtureFromFile(fixturePath);
    expect(fixtureResult.ok).toBe(true);
    if (!fixtureResult.ok) {
      return;
    }

    const connectionResult = createDatabaseConnection();
    expect(connectionResult.ok).toBe(true);
    if (!connectionResult.ok) {
      return;
    }

    try {
      const migrationResult = runMigrations(connectionResult.value.db);
      expect(migrationResult.ok).toBe(true);
      if (!migrationResult.ok) {
        return;
      }

      const seedResult = seedDatabaseFromFixture(connectionResult.value.db, fixtureResult.value);
      expect(seedResult.ok).toBe(true);
      if (!seedResult.ok) {
        return;
      }

      const firstDay = fixtureResult.value.channelDaily[0];
      const lastDay = fixtureResult.value.channelDaily[fixtureResult.value.channelDaily.length - 1];
      expect(firstDay).toBeDefined();
      expect(lastDay).toBeDefined();
      if (!firstDay || !lastDay) {
        return;
      }

      const cache = createAnalyticsQueryCache(connectionResult.value.db);
      const metricsQueries = createMetricsQueries(connectionResult.value.db, { cache });

      const firstQuery = metricsQueries.getKpis({
        channelId: fixtureResult.value.channel.channelId,
        dateFrom: firstDay.date,
        dateTo: lastDay.date,
      });
      expect(firstQuery.ok).toBe(true);
      if (!firstQuery.ok) {
        return;
      }

      const secondQuery = metricsQueries.getKpis({
        channelId: fixtureResult.value.channel.channelId,
        dateFrom: firstDay.date,
        dateTo: lastDay.date,
      });
      expect(secondQuery.ok).toBe(true);
      if (!secondQuery.ok) {
        return;
      }

      const eventSummary = connectionResult.value.db
        .prepare<[], { hits: number; misses: number; sets: number }>(
          `
            SELECT
              SUM(CASE WHEN event_type = 'hit' THEN 1 ELSE 0 END) AS hits,
              SUM(CASE WHEN event_type = 'miss' THEN 1 ELSE 0 END) AS misses,
              SUM(CASE WHEN event_type = 'set' THEN 1 ELSE 0 END) AS sets
            FROM analytics_cache_events
          `,
        )
        .get();

      expect((eventSummary?.hits ?? 0) >= 1).toBe(true);
      expect((eventSummary?.misses ?? 0) >= 1).toBe(true);
      expect((eventSummary?.sets ?? 0) >= 1).toBe(true);

      const invalidateResult = cache.invalidateAll({ reason: 'integration-test' });
      expect(invalidateResult.ok).toBe(true);
      if (!invalidateResult.ok) {
        return;
      }
      expect(invalidateResult.value.revision).toBeGreaterThanOrEqual(1);

      const snapshotResult = cache.getPerformanceSnapshot({ windowHours: 24 });
      expect(snapshotResult.ok).toBe(true);
      if (!snapshotResult.ok) {
        return;
      }

      expect(snapshotResult.value.cache.hits).toBeGreaterThanOrEqual(1);
      expect(snapshotResult.value.cache.misses).toBeGreaterThanOrEqual(1);
      expect(snapshotResult.value.cache.invalidations).toBeGreaterThanOrEqual(1);
      expect(snapshotResult.value.cache.hitRate).toBeGreaterThan(0);
      expect(snapshotResult.value.latencies.sampleSize).toBeGreaterThanOrEqual(2);
      expect(snapshotResult.value.latencies.p95Ms).toBeGreaterThanOrEqual(snapshotResult.value.latencies.p50Ms);

      const cachedRowsAfterInvalidate = connectionResult.value.db
        .prepare<[], { total: number }>(
          `
            SELECT COUNT(*) AS total
            FROM analytics_query_cache
          `,
        )
        .get();
      expect(cachedRowsAfterInvalidate?.total ?? 0).toBe(0);
    } finally {
      const closeResult = connectionResult.value.close();
      expect(closeResult.ok).toBe(true);
    }
  });
});
