import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDatabaseConnection } from './database.ts';
import { loadSeedFixtureFromFile, seedDatabaseFromFixture } from './fixtures/index.ts';
import { runMigrations } from './migrations/index.ts';
import { createChannelQueries } from './queries/channel-queries.ts';
import { createMetricsQueries } from './queries/metrics-queries.ts';

const fixturePath = fileURLToPath(new URL('../../../fixtures/seed-data.json', import.meta.url));

describe('analytics tracing integration', () => {
  it('persists trace rows and lineage entries for core analytical queries', () => {
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

      const metricsQueries = createMetricsQueries(connectionResult.value.db);
      const channelQueries = createChannelQueries(connectionResult.value.db);

      const kpiResult = metricsQueries.getKpis({
        channelId: fixtureResult.value.channel.channelId,
        dateFrom: firstDay.date,
        dateTo: lastDay.date,
      });
      expect(kpiResult.ok).toBe(true);

      const timeseriesResult = metricsQueries.getTimeseries({
        channelId: fixtureResult.value.channel.channelId,
        metric: 'views',
        dateFrom: firstDay.date,
        dateTo: lastDay.date,
        granularity: 'week',
      });
      expect(timeseriesResult.ok).toBe(true);

      const channelResult = channelQueries.getChannelInfo({
        channelId: fixtureResult.value.channel.channelId,
      });
      expect(channelResult.ok).toBe(true);

      const traceRuns = connectionResult.value.db
        .prepare<
          [],
          {
            traceId: string;
            operationName: string;
            status: 'ok' | 'error';
            rowCount: number;
            durationMs: number;
          }
        >(
          `
            SELECT
              trace_id AS traceId,
              operation_name AS operationName,
              status,
              row_count AS rowCount,
              duration_ms AS durationMs
            FROM analytics_trace_runs
            ORDER BY id ASC
          `,
        )
        .all();

      expect(traceRuns.length).toBeGreaterThanOrEqual(3);

      const kpiTrace = traceRuns.find((row) => row.operationName === 'metrics.getKpis');
      const timeseriesTrace = traceRuns.find((row) => row.operationName === 'metrics.getTimeseries');
      const channelTrace = traceRuns.find((row) => row.operationName === 'channel.getChannelInfo');

      expect(kpiTrace).toBeDefined();
      expect(timeseriesTrace).toBeDefined();
      expect(channelTrace).toBeDefined();

      if (kpiTrace) {
        expect(kpiTrace.status).toBe('ok');
        expect(kpiTrace.rowCount).toBe(1);
        expect(kpiTrace.durationMs).toBeGreaterThanOrEqual(0);
      }

      if (timeseriesTrace) {
        expect(timeseriesTrace.status).toBe('ok');
        expect(timeseriesTrace.rowCount).toBeGreaterThan(0);
      }

      const lineageRows = connectionResult.value.db
        .prepare<
          [],
          {
            traceId: string;
            sourceTable: string;
            primaryKeysJson: string;
            dateFrom: string | null;
            dateTo: string | null;
          }
        >(
          `
            SELECT
              trace_id AS traceId,
              source_table AS sourceTable,
              primary_keys_json AS primaryKeysJson,
              date_from AS dateFrom,
              date_to AS dateTo
            FROM analytics_trace_lineage
            ORDER BY id ASC
          `,
        )
        .all();

      expect(lineageRows.length).toBeGreaterThanOrEqual(3);
      const kpiLineage = lineageRows.filter((row) => row.traceId === kpiTrace?.traceId);
      expect(kpiLineage.length).toBeGreaterThanOrEqual(2);
      const hasFactChannelDayLineage = kpiLineage.some((row) => row.sourceTable === 'fact_channel_day');
      expect(hasFactChannelDayLineage).toBe(true);
    } finally {
      const closeResult = connectionResult.value.close();
      expect(closeResult.ok).toBe(true);
    }
  });
});
