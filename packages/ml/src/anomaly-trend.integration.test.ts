import { createDatabaseConnection, runMigrations } from '@moze/core';
import { describe, expect, it } from 'vitest';
import { getMlAnomalies, getMlTrend, runAnomalyTrendAnalysis } from './anomaly-trend.ts';

const CHANNEL_ID = 'UC-TREND-TEST-001';
const SERIES_START = '2026-01-01T00:00:00.000Z';

function toIsoDateFromOffset(offset: number): string {
  const date = new Date(SERIES_START);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function dayOffsetFromIsoDate(dateIso: string): number {
  const base = new Date(SERIES_START).getTime();
  const value = new Date(`${dateIso}T00:00:00.000Z`).getTime();
  return Math.round((value - base) / 86_400_000);
}

function createDb() {
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

  connectionResult.value.db.prepare(
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
        'Trend test channel',
        '',
        NULL,
        '2024-01-01T00:00:00.000Z',
        1000,
        100,
        100000,
        NULL,
        '2026-01-01T00:00:00.000Z'
      )
    `,
  ).run({ channelId: CHANNEL_ID });

  return connectionResult.value;
}

function insertSeries(db: ReturnType<typeof createDb>['db'], values: readonly number[]): void {
  const insertStmt = db.prepare<{
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

  const insertFeatureStmt = db.prepare<{
    channelId: string;
    date: string;
    daysSinceLastVideo: number;
  }>(
    `
      INSERT INTO ml_features (
        channel_id,
        date,
        feature_set_version,
        views_7d,
        views_30d,
        subscriber_delta_7d,
        engagement_rate_7d,
        publish_frequency_30d,
        days_since_last_video,
        source_sync_run_id,
        generated_at
      )
      VALUES (
        @channelId,
        @date,
        'v1',
        0,
        0,
        0,
        0,
        0,
        @daysSinceLastVideo,
        NULL,
        @date || 'T00:00:00.000Z'
      )
    `,
  );

  for (let index = 0; index < values.length; index += 1) {
    const views = Math.max(0, Math.round(values[index] ?? 0));
    const date = toIsoDateFromOffset(index);
    insertStmt.run({
      channelId: CHANNEL_ID,
      date,
      subscribers: 1000 + index,
      views,
      videos: 100 + Math.floor(index / 7),
      likes: Math.round(views * 0.08),
      comments: Math.round(views * 0.01),
      updatedAt: `${date}T00:00:00.000Z`,
    });
    insertFeatureStmt.run({
      channelId: CHANNEL_ID,
      date,
      daysSinceLastVideo: index % 6,
    });
  }
}

describe('anomaly + trend integration', () => {
  it('detects planted outliers and persists anomalies in sqlite', () => {
    const connection = createDb();
    const values: number[] = [];

    for (let index = 0; index < 60; index += 1) {
      const base = 1800 + index * 12;
      const seasonal = (index % 7) * 35;
      let value = base + seasonal;
      if (index === 30) {
        value *= 4.2;
      }
      if (index === 45) {
        value *= 0.18;
      }
      values.push(Math.round(value));
    }

    insertSeries(connection.db, values);

    const runResult = runAnomalyTrendAnalysis({
      db: connection.db,
      channelId: CHANNEL_ID,
      targetMetric: 'views',
      now: () => new Date('2026-02-15T09:00:00.000Z'),
    });
    expect(runResult.ok).toBe(true);
    if (!runResult.ok) {
      return;
    }

    expect(runResult.value.anomaliesDetected).toBeGreaterThan(0);
    expect(runResult.value.changePointsDetected).toBeGreaterThan(0);

    const anomaliesResult = getMlAnomalies({
      db: connection.db,
      channelId: CHANNEL_ID,
      targetMetric: 'views',
      dateFrom: toIsoDateFromOffset(0),
      dateTo: toIsoDateFromOffset(59),
    });
    expect(anomaliesResult.ok).toBe(true);
    if (!anomaliesResult.ok) {
      return;
    }

    const anomalyDates = new Set(anomaliesResult.value.items.map((item) => item.date));
    expect(anomalyDates.has(toIsoDateFromOffset(30)) || anomalyDates.has(toIsoDateFromOffset(45))).toBe(true);
    expect(
      anomaliesResult.value.items.some((item) => item.method === 'consensus' || item.method === 'zscore'),
    ).toBe(true);

    const closeResult = connection.close();
    expect(closeResult.ok).toBe(true);
  });

  it('finds planted change point and exposes trend decomposition', () => {
    const connection = createDb();
    const values: number[] = [];

    for (let index = 0; index < 80; index += 1) {
      const seasonal = ((index % 7) - 3) * 25;
      let value: number;
      if (index < 40) {
        value = 1200 + index * 6 + seasonal;
      } else {
        value = 2300 + (index - 40) * 7 + seasonal;
      }
      values.push(Math.round(value));
    }

    insertSeries(connection.db, values);

    const trendResult = getMlTrend({
      db: connection.db,
      channelId: CHANNEL_ID,
      targetMetric: 'views',
      dateFrom: toIsoDateFromOffset(0),
      dateTo: toIsoDateFromOffset(79),
      seasonalityPeriodDays: 7,
    });
    expect(trendResult.ok).toBe(true);
    if (!trendResult.ok) {
      return;
    }

    expect(trendResult.value.points.length).toBe(80);
    expect(trendResult.value.changePoints.length).toBeGreaterThan(0);

    const changePointOffsets = trendResult.value.changePoints.map((changePoint) => dayOffsetFromIsoDate(changePoint.date));
    expect(changePointOffsets.some((offset) => offset >= 36 && offset <= 45)).toBe(true);

    const decompositionSample = trendResult.value.points[20];
    expect(decompositionSample).toBeDefined();
    if (decompositionSample) {
      const reconstructed = decompositionSample.trend + decompositionSample.seasonal + decompositionSample.residual;
      expect(Math.abs(reconstructed - decompositionSample.value)).toBeLessThan(2);
    }

    const closeResult = connection.close();
    expect(closeResult.ok).toBe(true);
  });
});
