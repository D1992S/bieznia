import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDatabaseConnection } from './database.ts';
import { loadSeedFixtureFromFile, seedDatabaseFromFixture } from './fixtures/index.ts';
import { runMigrations } from './migrations/index.ts';
import { createMetricsQueries } from './queries/metrics-queries.ts';
import { createSettingsQueries } from './queries/settings-queries.ts';

const fixturePath = fileURLToPath(new URL('../../../fixtures/seed-data.json', import.meta.url));

describe('Data Core integration', () => {
  it('runs migrations idempotently and creates required tables', () => {
    const connectionResult = createDatabaseConnection();
    expect(connectionResult.ok).toBe(true);
    if (!connectionResult.ok) {
      return;
    }

    const firstRun = runMigrations(connectionResult.value.db);
    expect(firstRun.ok).toBe(true);
    if (!firstRun.ok) {
      return;
    }

    const secondRun = runMigrations(connectionResult.value.db);
    expect(secondRun.ok).toBe(true);
    if (!secondRun.ok) {
      return;
    }

    expect(secondRun.value.applied).toHaveLength(0);

    const tableRows = connectionResult.value.db
      .prepare<[], { name: string }>(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
          ORDER BY name ASC
        `,
      )
      .all();

    const tableNames = new Set(tableRows.map((row) => row.name));

    for (const tableName of [
      'raw_api_responses',
      'profiles',
      'app_meta',
      'sync_runs',
      'dim_channel',
      'dim_video',
      'fact_channel_day',
      'fact_video_day',
      'stg_channels',
      'stg_videos',
      'ml_features',
      'data_lineage',
      'ml_models',
      'ml_predictions',
      'ml_backtests',
      'analytics_trace_runs',
      'analytics_trace_lineage',
      'analytics_query_cache',
      'analytics_cache_events',
      'agg_quality_scores',
      'dim_competitor',
      'fact_competitor_day',
      'dim_topic_cluster',
      'fact_topic_pressure_day',
      'agg_topic_gaps',
      'assistant_threads',
      'assistant_messages',
      'assistant_message_evidence',
    ]) {
      expect(tableNames.has(tableName)).toBe(true);
    }

    const closeResult = connectionResult.value.close();
    expect(closeResult.ok).toBe(true);
  });

  it('loads fixture, seeds database and returns deterministic KPI/timeseries results', () => {
    const fixtureResult = loadSeedFixtureFromFile(fixturePath);
    expect(fixtureResult.ok).toBe(true);
    if (!fixtureResult.ok) {
      return;
    }

    const fixture = fixtureResult.value;

    const connectionResult = createDatabaseConnection();
    expect(connectionResult.ok).toBe(true);
    if (!connectionResult.ok) {
      return;
    }

    const migrationResult = runMigrations(connectionResult.value.db);
    expect(migrationResult.ok).toBe(true);
    if (!migrationResult.ok) {
      return;
    }

    const seedResult = seedDatabaseFromFixture(connectionResult.value.db, fixture);
    expect(seedResult.ok).toBe(true);
    if (!seedResult.ok) {
      return;
    }

    expect(seedResult.value.videosInserted).toBe(50);
    expect(seedResult.value.channelDaysInserted).toBe(90);

    const videoCountRow = connectionResult.value.db
      .prepare<[], { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM dim_video
          ORDER BY total ASC
        `,
      )
      .get();

    const channelDayCountRow = connectionResult.value.db
      .prepare<[], { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM fact_channel_day
          ORDER BY total ASC
        `,
      )
      .get();

    expect(videoCountRow?.total ?? 0).toBe(50);
    expect(channelDayCountRow?.total ?? 0).toBe(90);

    const firstDay = fixture.channelDaily[0];
    const lastDay = fixture.channelDaily[fixture.channelDaily.length - 1];
    expect(firstDay).toBeDefined();
    expect(lastDay).toBeDefined();
    if (!firstDay || !lastDay) {
      return;
    }

    const queries = createMetricsQueries(connectionResult.value.db);

    const kpiResult = queries.getKpis({
      channelId: fixture.channel.channelId,
      dateFrom: firstDay.date,
      dateTo: lastDay.date,
    });

    expect(kpiResult.ok).toBe(true);
    if (!kpiResult.ok) {
      return;
    }

    expect(kpiResult.value.views).toBeGreaterThan(0);
    expect(kpiResult.value.subscribers).toBeGreaterThan(0);

    const timeseriesResult = queries.getTimeseries({
      channelId: fixture.channel.channelId,
      metric: 'views',
      dateFrom: firstDay.date,
      dateTo: lastDay.date,
      granularity: 'day',
    });

    expect(timeseriesResult.ok).toBe(true);
    if (!timeseriesResult.ok) {
      return;
    }

    expect(timeseriesResult.value.points).toHaveLength(90);

    for (let i = 1; i < timeseriesResult.value.points.length; i += 1) {
      const previous = timeseriesResult.value.points[i - 1];
      const current = timeseriesResult.value.points[i];
      if (!previous || !current) {
        continue;
      }
      expect(previous.date <= current.date).toBe(true);
    }

    const weeklyResult = queries.getTimeseries({
      channelId: fixture.channel.channelId,
      metric: 'views',
      dateFrom: firstDay.date,
      dateTo: lastDay.date,
      granularity: 'week',
    });

    expect(weeklyResult.ok).toBe(true);
    if (!weeklyResult.ok) {
      return;
    }

    expect(weeklyResult.value.points.length).toBeGreaterThan(0);
    expect(weeklyResult.value.points.length).toBeLessThan(90);

    const settingsQueries = createSettingsQueries(connectionResult.value.db);
    const defaultSettingsResult = settingsQueries.getProfileSettings();
    expect(defaultSettingsResult.ok).toBe(true);
    if (!defaultSettingsResult.ok) {
      return;
    }
    expect(defaultSettingsResult.value.defaultDatePreset).toBe('30d');

    const updateSettingsResult = settingsQueries.updateProfileSettings({
      defaultDatePreset: '7d',
      autoRunSync: true,
    });
    expect(updateSettingsResult.ok).toBe(true);
    if (!updateSettingsResult.ok) {
      return;
    }
    expect(updateSettingsResult.value.defaultDatePreset).toBe('7d');
    expect(updateSettingsResult.value.autoRunSync).toBe(true);

    const closeResult = connectionResult.value.close();
    expect(closeResult.ok).toBe(true);
  });
});
