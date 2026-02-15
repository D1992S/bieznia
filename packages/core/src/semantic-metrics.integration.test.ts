import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDatabaseConnection } from './database.ts';
import { loadSeedFixtureFromFile, seedDatabaseFromFixture } from './fixtures/index.ts';
import { runMigrations } from './migrations/index.ts';
import { createSemanticMetricService } from './semantic/index.ts';

const fixturePath = fileURLToPath(new URL('../../../fixtures/seed-data.json', import.meta.url));

describe('semantic metrics integration', () => {
  it('exposes metric catalog and reads raw + derived metric values', () => {
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

      const semanticMetrics = createSemanticMetricService(connectionResult.value.db);
      const catalog = semanticMetrics.listMetricDefinitions();
      expect(catalog.length).toBeGreaterThanOrEqual(15);
      expect(catalog.length).toBeLessThanOrEqual(25);

      const valuesResult = semanticMetrics.readMetricValues({
        metricIds: [
          'channel.views.total',
          'channel.likes.total',
          'channel.comments.total',
          'channel.subscribers.latest',
          'channel.videos.latest',
          'channel.avg_views_per_video',
          'channel.engagement_rate',
          'video.views.max',
        ],
        channelId: fixtureResult.value.channel.channelId,
        dateFrom: firstDay.date,
        dateTo: lastDay.date,
      });
      expect(valuesResult.ok).toBe(true);
      if (!valuesResult.ok) {
        return;
      }

      expect(valuesResult.value['channel.views.total']).toBeGreaterThan(0);
      expect(valuesResult.value['channel.likes.total']).toBeGreaterThan(0);
      expect(valuesResult.value['channel.comments.total']).toBeGreaterThan(0);
      expect(valuesResult.value['channel.subscribers.latest']).toBeGreaterThan(0);
      expect(valuesResult.value['channel.videos.latest']).toBeGreaterThan(0);
      expect(valuesResult.value['channel.avg_views_per_video']).toBeGreaterThan(0);
      expect(valuesResult.value['channel.engagement_rate']).toBeGreaterThan(0);
      expect(valuesResult.value['video.views.max']).toBeGreaterThan(0);

      const timeseriesResult = semanticMetrics.readTimeseries({
        channelId: fixtureResult.value.channel.channelId,
        metric: 'views',
        dateFrom: firstDay.date,
        dateTo: lastDay.date,
        granularity: 'month',
      });
      expect(timeseriesResult.ok).toBe(true);
      if (!timeseriesResult.ok) {
        return;
      }

      expect(timeseriesResult.value.points.length).toBeGreaterThan(0);
      expect(timeseriesResult.value.points.length).toBeLessThanOrEqual(4);
    } finally {
      const closeResult = connectionResult.value.close();
      expect(closeResult.ok).toBe(true);
    }
  });
});
