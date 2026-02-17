import { fileURLToPath } from 'node:url';
import { createDatabaseConnection, loadSeedFixtureFromFile, runMigrations, seedDatabaseFromFixture, type DatabaseConnection, type SeedFixture } from '@moze/core';
import { describe, expect, it } from 'vitest';
import { runDataPipeline } from './pipeline-runner.ts';

const fixturePath = fileURLToPath(new URL('../../../fixtures/seed-data.json', import.meta.url));
const FIXED_NOW_ISO = '2026-02-12T12:00:00.000Z';

interface SeededDatabase {
  connection: DatabaseConnection;
  fixture: SeedFixture;
}

function createSeededDatabase(): SeededDatabase | null {
  const fixtureResult = loadSeedFixtureFromFile(fixturePath);
  expect(fixtureResult.ok).toBe(true);
  if (!fixtureResult.ok) {
    return null;
  }

  const connectionResult = createDatabaseConnection();
  expect(connectionResult.ok).toBe(true);
  if (!connectionResult.ok) {
    return null;
  }

  const migrationResult = runMigrations(connectionResult.value.db);
  expect(migrationResult.ok).toBe(true);
  if (!migrationResult.ok) {
    const closeResult = connectionResult.value.close();
    expect(closeResult.ok).toBe(true);
    return null;
  }

  const seedResult = seedDatabaseFromFixture(connectionResult.value.db, fixtureResult.value);
  expect(seedResult.ok).toBe(true);
  if (!seedResult.ok) {
    const closeResult = connectionResult.value.close();
    expect(closeResult.ok).toBe(true);
    return null;
  }

  return {
    connection: connectionResult.value,
    fixture: fixtureResult.value,
  };
}

function closeSeededDatabase(connection: DatabaseConnection): void {
  const closeResult = connection.close();
  expect(closeResult.ok).toBe(true);
}

describe('Data pipeline integration', () => {
  it('runs deterministic ETL and writes staging, features and lineage tables', () => {
    const seeded = createSeededDatabase();
    if (!seeded) {
      return;
    }

    const channelId = seeded.fixture.channel.channelId;
    const runResult = runDataPipeline({
      db: seeded.connection.db,
      channelId,
      now: () => new Date(FIXED_NOW_ISO),
    });

    expect(runResult.ok).toBe(true);
    if (!runResult.ok) {
      closeSeededDatabase(seeded.connection);
      return;
    }

    expect(runResult.value.generatedFeatures).toBe(seeded.fixture.channelDaily.length);
    expect(runResult.value.stagedVideos).toBe(seeded.fixture.videos.length);

    const stgChannelCount = seeded.connection.db
      .prepare<{ channelId: string }, { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM stg_channels
          WHERE channel_id = @channelId
          ORDER BY total ASC
        `,
      )
      .get({ channelId });

    const stgVideoCount = seeded.connection.db
      .prepare<{ channelId: string }, { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM stg_videos
          WHERE channel_id = @channelId
          ORDER BY total ASC
        `,
      )
      .get({ channelId });

    const featureCount = seeded.connection.db
      .prepare<{ channelId: string }, { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM ml_features
          WHERE channel_id = @channelId
            AND feature_set_version = 'v1'
          ORDER BY total ASC
        `,
      )
      .get({ channelId });

    expect(stgChannelCount?.total ?? 0).toBe(1);
    expect(stgVideoCount?.total ?? 0).toBe(seeded.fixture.videos.length);
    expect(featureCount?.total ?? 0).toBe(seeded.fixture.channelDaily.length);

    const firstFeature = seeded.connection.db
      .prepare<{ channelId: string }, { date: string; views7d: number; views30d: number; engagementRate7d: number }>(
        `
          SELECT
            date,
            views_7d AS views7d,
            views_30d AS views30d,
            engagement_rate_7d AS engagementRate7d
          FROM ml_features
          WHERE channel_id = @channelId
            AND feature_set_version = 'v1'
          ORDER BY date ASC
          LIMIT 1
        `,
      )
      .get({ channelId });

    const expectedFirstDay = seeded.fixture.channelDaily[0];
    expect(firstFeature).toBeDefined();
    expect(expectedFirstDay).toBeDefined();
    if (!firstFeature || !expectedFirstDay) {
      closeSeededDatabase(seeded.connection);
      return;
    }

    expect(firstFeature.date).toBe(expectedFirstDay.date);
    expect(firstFeature.views7d).toBe(expectedFirstDay.views);
    expect(firstFeature.views30d).toBe(expectedFirstDay.views);
    expect(firstFeature.engagementRate7d).toBeGreaterThanOrEqual(0);

    const lineageStages = seeded.connection.db
      .prepare<{ channelId: string }, { stage: string }>(
        `
          SELECT pipeline_stage AS stage
          FROM data_lineage
          WHERE entity_type = 'channel'
            AND entity_key = @channelId
          ORDER BY id ASC
        `,
      )
      .all({ channelId });

    expect(lineageStages.map((row) => row.stage)).toEqual([
      'ingest',
      'validation',
      'staging',
      'feature-generation',
    ]);

    closeSeededDatabase(seeded.connection);
  });

  it('keeps feature rows deterministic between repeated runs', () => {
    const seeded = createSeededDatabase();
    if (!seeded) {
      return;
    }

    const channelId = seeded.fixture.channel.channelId;
    const firstRun = runDataPipeline({
      db: seeded.connection.db,
      channelId,
      now: () => new Date(FIXED_NOW_ISO),
    });
    expect(firstRun.ok).toBe(true);
    if (!firstRun.ok) {
      closeSeededDatabase(seeded.connection);
      return;
    }

    const firstRows = seeded.connection.db
      .prepare<{ channelId: string }, {
        date: string;
        views7d: number;
        views30d: number;
        subscriberDelta7d: number;
        engagementRate7d: number;
        publishFrequency30d: number;
        daysSinceLastVideo: number | null;
      }>(
        `
          SELECT
            date,
            views_7d AS views7d,
            views_30d AS views30d,
            subscriber_delta_7d AS subscriberDelta7d,
            engagement_rate_7d AS engagementRate7d,
            publish_frequency_30d AS publishFrequency30d,
            days_since_last_video AS daysSinceLastVideo
          FROM ml_features
          WHERE channel_id = @channelId
            AND feature_set_version = 'v1'
          ORDER BY date ASC
        `,
      )
      .all({ channelId });

    const secondRun = runDataPipeline({
      db: seeded.connection.db,
      channelId,
      now: () => new Date(FIXED_NOW_ISO),
    });
    expect(secondRun.ok).toBe(true);
    if (!secondRun.ok) {
      closeSeededDatabase(seeded.connection);
      return;
    }

    const secondRows = seeded.connection.db
      .prepare<{ channelId: string }, {
        date: string;
        views7d: number;
        views30d: number;
        subscriberDelta7d: number;
        engagementRate7d: number;
        publishFrequency30d: number;
        daysSinceLastVideo: number | null;
      }>(
        `
          SELECT
            date,
            views_7d AS views7d,
            views_30d AS views30d,
            subscriber_delta_7d AS subscriberDelta7d,
            engagement_rate_7d AS engagementRate7d,
            publish_frequency_30d AS publishFrequency30d,
            days_since_last_video AS daysSinceLastVideo
          FROM ml_features
          WHERE channel_id = @channelId
            AND feature_set_version = 'v1'
          ORDER BY date ASC
        `,
      )
      .all({ channelId });

    expect(secondRows).toEqual(firstRows);
    expect(secondRows.length).toBe(seeded.fixture.channelDaily.length);

    closeSeededDatabase(seeded.connection);
  });

  it('recomputes only incremental feature window when changedDate range is provided', () => {
    const seeded = createSeededDatabase();
    if (!seeded) {
      return;
    }

    const channelId = seeded.fixture.channel.channelId;
    const firstDay = seeded.fixture.channelDaily[0];
    const lastDay = seeded.fixture.channelDaily[seeded.fixture.channelDaily.length - 1];
    expect(firstDay).toBeDefined();
    expect(lastDay).toBeDefined();
    if (!firstDay || !lastDay) {
      closeSeededDatabase(seeded.connection);
      return;
    }

    const firstRun = runDataPipeline({
      db: seeded.connection.db,
      channelId,
      now: () => new Date(FIXED_NOW_ISO),
    });
    expect(firstRun.ok).toBe(true);
    if (!firstRun.ok) {
      closeSeededDatabase(seeded.connection);
      return;
    }

    const originalFeatureTimestamps = seeded.connection.db
      .prepare<{ channelId: string; firstDate: string; lastDate: string }, { firstGeneratedAt: string; lastGeneratedAt: string }>(
        `
          SELECT
            MAX(CASE WHEN date = @firstDate THEN generated_at END) AS firstGeneratedAt,
            MAX(CASE WHEN date = @lastDate THEN generated_at END) AS lastGeneratedAt
          FROM ml_features
          WHERE channel_id = @channelId
            AND feature_set_version = 'v1'
        `,
      )
      .get({
        channelId,
        firstDate: firstDay.date,
        lastDate: lastDay.date,
      });
    expect(originalFeatureTimestamps?.firstGeneratedAt).toBe(FIXED_NOW_ISO);
    expect(originalFeatureTimestamps?.lastGeneratedAt).toBe(FIXED_NOW_ISO);

    seeded.connection.db
      .prepare<{ channelId: string; date: string }>(
        `
          UPDATE fact_channel_day
          SET views = views + 777
          WHERE channel_id = @channelId
            AND date = @date
        `,
      )
      .run({
        channelId,
        date: lastDay.date,
      });

    const incrementalNowIso = '2026-02-13T12:00:00.000Z';
    const secondRun = runDataPipeline({
      db: seeded.connection.db,
      channelId,
      changedDateFrom: lastDay.date,
      changedDateTo: lastDay.date,
      now: () => new Date(incrementalNowIso),
    });
    expect(secondRun.ok).toBe(true);
    if (!secondRun.ok) {
      closeSeededDatabase(seeded.connection);
      return;
    }

    expect(secondRun.value.generatedFeatures).toBeLessThan(seeded.fixture.channelDaily.length);
    expect(secondRun.value.generatedFeatures).toBeLessThanOrEqual(30);

    const refreshedFeatureTimestamps = seeded.connection.db
      .prepare<{ channelId: string; firstDate: string; lastDate: string }, { firstGeneratedAt: string; lastGeneratedAt: string; total: number }>(
        `
          SELECT
            MAX(CASE WHEN date = @firstDate THEN generated_at END) AS firstGeneratedAt,
            MAX(CASE WHEN date = @lastDate THEN generated_at END) AS lastGeneratedAt,
            COUNT(*) AS total
          FROM ml_features
          WHERE channel_id = @channelId
            AND feature_set_version = 'v1'
        `,
      )
      .get({
        channelId,
        firstDate: firstDay.date,
        lastDate: lastDay.date,
      });

    expect(refreshedFeatureTimestamps?.firstGeneratedAt).toBe(FIXED_NOW_ISO);
    expect(refreshedFeatureTimestamps?.lastGeneratedAt).toBe(incrementalNowIso);
    expect(refreshedFeatureTimestamps?.total ?? 0).toBe(seeded.fixture.channelDaily.length);

    closeSeededDatabase(seeded.connection);
  });

  it('rejects invalid metric ranges during validation', () => {
    const seeded = createSeededDatabase();
    if (!seeded) {
      return;
    }

    const channelId = seeded.fixture.channel.channelId;
    const firstDay = seeded.fixture.channelDaily[0];
    expect(firstDay).toBeDefined();
    if (!firstDay) {
      closeSeededDatabase(seeded.connection);
      return;
    }

    seeded.connection.db
      .prepare<{ channelId: string; date: string }>(
        `
          UPDATE fact_channel_day
          SET views = -1
          WHERE channel_id = @channelId
            AND date = @date
        `,
      )
      .run({
        channelId,
        date: firstDay.date,
      });

    const runResult = runDataPipeline({
      db: seeded.connection.db,
      channelId,
      now: () => new Date(FIXED_NOW_ISO),
    });

    expect(runResult.ok).toBe(false);
    if (!runResult.ok) {
      expect(runResult.error.code).toBe('PIPELINE_VALIDATION_FAILED');
    }

    const stgChannelCount = seeded.connection.db
      .prepare<{ channelId: string }, { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM stg_channels
          WHERE channel_id = @channelId
          ORDER BY total ASC
        `,
      )
      .get({ channelId });

    expect(stgChannelCount?.total ?? 0).toBe(0);

    closeSeededDatabase(seeded.connection);
  });

  it('rejects stale snapshots when freshness window is exceeded', () => {
    const seeded = createSeededDatabase();
    if (!seeded) {
      return;
    }

    const channelId = seeded.fixture.channel.channelId;
    const runResult = runDataPipeline({
      db: seeded.connection.db,
      channelId,
      maxFreshnessDays: 30,
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    });

    expect(runResult.ok).toBe(false);
    if (!runResult.ok) {
      expect(runResult.error.code).toBe('PIPELINE_DATA_STALE');
    }

    closeSeededDatabase(seeded.connection);
  });
});
