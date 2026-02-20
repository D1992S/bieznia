import { fileURLToPath } from 'node:url';
import {
  createDatabaseConnection,
  loadSeedFixtureFromFile,
  runMigrations,
  seedDatabaseFromFixture,
} from '@moze/core';
import { describe, expect, it } from 'vitest';
import { getLatestMlForecast, runMlBaseline } from './ml-baseline.ts';

const fixturePath = fileURLToPath(new URL('../../../fixtures/seed-data.json', import.meta.url));
const channelId = 'UC-SEED-PL-001';

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

  return connectionResult.value;
}

describe('ML baseline integration', () => {
  it('trains baseline models, stores backtests and writes p10/p50/p90 predictions', () => {
    const connection = createSeededDb();

    const runResult = runMlBaseline({
      db: connection.db,
      channelId,
      targetMetric: 'views',
      horizonDays: 7,
      now: () => new Date('2026-02-12T12:00:00.000Z'),
    });

    expect(runResult.ok).toBe(true);
    if (!runResult.ok) {
      const closeResult = connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    expect(runResult.value.status).toBe('completed');
    expect(runResult.value.models).toHaveLength(2);
    expect(runResult.value.predictionsGenerated).toBe(14);

    const activeModels = runResult.value.models.filter((model) => model.status === 'active');
    expect(activeModels.length).toBeLessThanOrEqual(1);

    const modelCountRow = connection.db
      .prepare<[], { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM ml_models
          ORDER BY total ASC
          LIMIT 1
        `,
      )
      .get();
    const backtestCountRow = connection.db
      .prepare<[], { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM ml_backtests
          ORDER BY total ASC
          LIMIT 1
        `,
      )
      .get();
    const predictionRows = connection.db
      .prepare<
        [],
        { p10: number; p50: number; p90: number }
      >(
        `
          SELECT
            p10,
            p50,
            p90
          FROM ml_predictions
          ORDER BY id ASC
        `,
      )
      .all();

    expect(modelCountRow?.total).toBe(2);
    expect(backtestCountRow?.total).toBe(2);
    expect(predictionRows.length).toBe(14);
    for (const row of predictionRows) {
      expect(row.p10 <= row.p50).toBe(true);
      expect(row.p50 <= row.p90).toBe(true);
    }

    const forecastResult = getLatestMlForecast({
      db: connection.db,
      channelId,
      targetMetric: 'views',
    });
    expect(forecastResult.ok).toBe(true);
    if (forecastResult.ok) {
      expect(forecastResult.value.modelType === 'holt-winters' || forecastResult.value.modelType === 'linear-regression').toBe(true);
      expect(forecastResult.value.points.length).toBe(7);
    }

    const closeResult = connection.close();
    expect(closeResult.ok).toBe(true);
  });

  it('returns graceful degradation for history shorter than minimum', () => {
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

    const db = connectionResult.value.db;
    db.prepare(
      `
        INSERT INTO dim_channel (
          channel_id,
          profile_id,
          name,
          description,
          thumbnail_url,
          published_at,
          subscriber_count,
          video_count,
          view_count,
          last_sync_at,
          updated_at
        )
        VALUES (
          @channelId,
          NULL,
          'Short history channel',
          '',
          NULL,
          '2026-01-01T00:00:00.000Z',
          100,
          10,
          1000,
          NULL,
          '2026-01-01T00:00:00.000Z'
        )
      `,
    ).run({ channelId: 'UC-SHORT-001' });

    const insertDayStmt = db.prepare<{
      channelId: string;
      date: string;
      subscribers: number;
      views: number;
      videos: number;
      likes: number;
      comments: number;
      updatedAt: string;
    }>(
      `
        INSERT INTO fact_channel_day (
          channel_id,
          date,
          subscribers,
          views,
          videos,
          likes,
          comments,
          watch_time_minutes,
          updated_at
        )
        VALUES (
          @channelId,
          @date,
          @subscribers,
          @views,
          @videos,
          @likes,
          @comments,
          NULL,
          @updatedAt
        )
      `,
    );

    for (let index = 0; index < 20; index += 1) {
      const day = new Date('2026-01-01T00:00:00.000Z');
      day.setUTCDate(day.getUTCDate() + index);
      const isoDay = day.toISOString().slice(0, 10);
      insertDayStmt.run({
        channelId: 'UC-SHORT-001',
        date: isoDay,
        subscribers: 100 + index,
        views: 1_000 + index * 10,
        videos: 10,
        likes: 100 + index,
        comments: 20 + index,
        updatedAt: `${isoDay}T00:00:00.000Z`,
      });
    }

    const runResult = runMlBaseline({
      db,
      channelId: 'UC-SHORT-001',
      targetMetric: 'views',
      minHistoryDays: 30,
    });

    expect(runResult.ok).toBe(true);
    if (runResult.ok) {
      expect(runResult.value.status).toBe('insufficient_data');
      expect(runResult.value.predictionsGenerated).toBe(0);
      expect(runResult.value.models).toHaveLength(0);
      expect(runResult.value.activeModelType).toBeNull();
    }

    const modelCountRow = db
      .prepare<[], { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM ml_models
          ORDER BY total ASC
          LIMIT 1
        `,
      )
      .get();
    expect(modelCountRow?.total ?? 0).toBe(0);

    const closeResult = connectionResult.value.close();
    expect(closeResult.ok).toBe(true);
  });

  it('does not activate model when quality gate thresholds are too strict', () => {
    const connection = createSeededDb();

    const runResult = runMlBaseline({
      db: connection.db,
      channelId,
      targetMetric: 'subscribers',
      qualityGate: {
        smapeMax: 0,
        maseMax: 0,
      },
      now: () => new Date('2026-02-12T13:00:00.000Z'),
    });

    expect(runResult.ok).toBe(true);
    if (runResult.ok) {
      expect(runResult.value.activeModelType).toBeNull();
      expect(runResult.value.models.every((model) => model.status === 'rejected')).toBe(true);
    }

    const forecastResult = getLatestMlForecast({
      db: connection.db,
      channelId,
      targetMetric: 'subscribers',
    });
    expect(forecastResult.ok).toBe(true);
    if (forecastResult.ok) {
      expect(forecastResult.value.modelType).toBeNull();
      expect(forecastResult.value.points).toHaveLength(0);
    }

    const closeResult = connection.close();
    expect(closeResult.ok).toBe(true);
  });
});
