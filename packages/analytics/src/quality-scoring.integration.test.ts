import { fileURLToPath } from 'node:url';
import { createDatabaseConnection, loadSeedFixtureFromFile, runMigrations, seedDatabaseFromFixture } from '@moze/core';
import { describe, expect, it } from 'vitest';
import { getQualityScores } from './quality-scoring.ts';

const fixturePath = fileURLToPath(new URL('../../../fixtures/seed-data.json', import.meta.url));

function createSeededDb() {
  const connectionResult = createDatabaseConnection();
  expect(connectionResult.ok).toBe(true);
  if (!connectionResult.ok) {
    throw new Error(connectionResult.error.message);
  }

  const migrationsResult = runMigrations(connectionResult.value.db);
  expect(migrationsResult.ok).toBe(true);
  if (!migrationsResult.ok) {
    throw new Error(migrationsResult.error.message);
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

  const allDates = fixtureResult.value.videoDaily.map((row) => row.date).sort((a, b) => a.localeCompare(b));
  const dateFrom = allDates[0];
  const dateTo = allDates[allDates.length - 1];
  if (!dateFrom || !dateTo) {
    throw new Error('Brak dat w fixture videoDaily.');
  }

  return {
    connection: connectionResult.value,
    channelId: fixtureResult.value.channel.channelId,
    dateFrom,
    dateTo,
  };
}

describe('Quality scoring integration', () => {
  it('builds ranking, persists breakdown and returns deterministic order', () => {
    const seeded = createSeededDb();

    const result = getQualityScores({
      db: seeded.connection.db,
      channelId: seeded.channelId,
      dateFrom: seeded.dateFrom,
      dateTo: seeded.dateTo,
      limit: 12,
      now: () => new Date('2026-02-17T10:00:00.000Z'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      const closeResult = seeded.connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    expect(result.value.items.length).toBeLessThanOrEqual(12);
    expect(result.value.total).toBeGreaterThan(0);
    for (let index = 1; index < result.value.items.length; index += 1) {
      const previous = result.value.items[index - 1];
      const current = result.value.items[index];
      if (!previous || !current) {
        continue;
      }
      expect(previous.score >= current.score).toBe(true);
    }

    const persistedCountRow = seeded.connection.db
      .prepare<
        { channelId: string; dateFrom: string; dateTo: string },
        { total: number }
      >(
        `
          SELECT COUNT(*) AS total
          FROM agg_quality_scores
          WHERE channel_id = @channelId
            AND date_from = @dateFrom
            AND date_to = @dateTo
          ORDER BY total ASC
          LIMIT 1
        `,
      )
      .get({
        channelId: seeded.channelId,
        dateFrom: seeded.dateFrom,
        dateTo: seeded.dateTo,
      });

    expect(persistedCountRow?.total).toBe(result.value.total);

    const confidenceRows = seeded.connection.db
      .prepare<
        { channelId: string; dateFrom: string; dateTo: string },
        { confidence: 'low' | 'medium' | 'high' }
      >(
        `
          SELECT DISTINCT confidence
          FROM agg_quality_scores
          WHERE channel_id = @channelId
            AND date_from = @dateFrom
            AND date_to = @dateTo
          ORDER BY confidence ASC
        `,
      )
      .all({
        channelId: seeded.channelId,
        dateFrom: seeded.dateFrom,
        dateTo: seeded.dateTo,
      });

    expect(confidenceRows.length).toBeGreaterThan(0);
    for (const row of confidenceRows) {
      expect(row.confidence === 'low' || row.confidence === 'medium' || row.confidence === 'high').toBe(true);
    }

    const closeResult = seeded.connection.close();
    expect(closeResult.ok).toBe(true);
  });

  it('elevates a planted high-engagement video to the top of ranking', () => {
    const seeded = createSeededDb();

    const baselineResult = getQualityScores({
      db: seeded.connection.db,
      channelId: seeded.channelId,
      dateFrom: seeded.dateFrom,
      dateTo: seeded.dateTo,
      limit: 100,
      now: () => new Date('2026-02-17T10:01:00.000Z'),
    });
    expect(baselineResult.ok).toBe(true);
    if (!baselineResult.ok) {
      const closeResult = seeded.connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    const boostedVideoId = baselineResult.value.items[baselineResult.value.items.length - 1]?.videoId;
    expect(boostedVideoId).toBeDefined();
    if (!boostedVideoId) {
      const closeResult = seeded.connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    seeded.connection.db
      .prepare<
        { videoId: string; dateFrom: string; dateTo: string },
        never
      >(
        `
          UPDATE fact_video_day
          SET
            views = 10000,
            likes = 12000,
            comments = 4000,
            watch_time_minutes = 50000
          WHERE video_id = @videoId
            AND date BETWEEN @dateFrom AND @dateTo
        `,
      )
      .run({
        videoId: boostedVideoId,
        dateFrom: seeded.dateFrom,
        dateTo: seeded.dateTo,
      });

    const result = getQualityScores({
      db: seeded.connection.db,
      channelId: seeded.channelId,
      dateFrom: seeded.dateFrom,
      dateTo: seeded.dateTo,
      limit: 5,
      now: () => new Date('2026-02-17T10:05:00.000Z'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items[0]?.videoId).toBe(boostedVideoId);
    }

    const closeResult = seeded.connection.close();
    expect(closeResult.ok).toBe(true);
  });

  it('assigns confidence labels based on available history length', () => {
    const connectionResult = createDatabaseConnection();
    expect(connectionResult.ok).toBe(true);
    if (!connectionResult.ok) {
      return;
    }

    const migrationsResult = runMigrations(connectionResult.value.db);
    expect(migrationsResult.ok).toBe(true);
    if (!migrationsResult.ok) {
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
          'UC-QS-001',
          NULL,
          'Quality confidence test',
          '',
          NULL,
          '2025-01-01T00:00:00.000Z',
          1000,
          3,
          0,
          NULL,
          '2026-02-17T10:10:00.000Z'
        )
      `,
    ).run();

    const insertVideoStmt = db.prepare<{
      videoId: string;
      title: string;
      publishedAt: string;
    }>(
      `
        INSERT INTO dim_video (
          video_id,
          channel_id,
          title,
          description,
          published_at,
          duration_seconds,
          view_count,
          like_count,
          comment_count,
          thumbnail_url,
          updated_at
        )
        VALUES (
          @videoId,
          'UC-QS-001',
          @title,
          '',
          @publishedAt,
          600,
          0,
          0,
          0,
          NULL,
          '2026-02-17T10:10:00.000Z'
        )
      `,
    );

    insertVideoStmt.run({ videoId: 'VID-HIGH', title: 'High confidence', publishedAt: '2025-01-01T12:00:00.000Z' });
    insertVideoStmt.run({ videoId: 'VID-MED', title: 'Medium confidence', publishedAt: '2025-02-01T12:00:00.000Z' });
    insertVideoStmt.run({ videoId: 'VID-LOW', title: 'Low confidence', publishedAt: '2025-03-01T12:00:00.000Z' });

    const insertChannelDayStmt = db.prepare<{
      date: string;
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
          'UC-QS-001',
          @date,
          1000,
          10000,
          3,
          100,
          10,
          2000,
          @date || 'T00:00:00.000Z'
        )
      `,
    );

    const insertVideoDayStmt = db.prepare<{
      videoId: string;
      date: string;
      views: number;
      likes: number;
      comments: number;
      watchTimeMinutes: number;
      impressions: number;
      ctr: number;
    }>(
      `
        INSERT INTO fact_video_day (
          video_id,
          channel_id,
          date,
          views,
          likes,
          comments,
          watch_time_minutes,
          impressions,
          ctr,
          updated_at
        )
        VALUES (
          @videoId,
          'UC-QS-001',
          @date,
          @views,
          @likes,
          @comments,
          @watchTimeMinutes,
          @impressions,
          @ctr,
          @date || 'T00:00:00.000Z'
        )
      `,
    );

    const startDate = new Date('2025-01-01T00:00:00.000Z');
    for (let index = 0; index < 70; index += 1) {
      const current = new Date(startDate);
      current.setUTCDate(startDate.getUTCDate() + index);
      const date = current.toISOString().slice(0, 10);
      insertChannelDayStmt.run({ date });

      insertVideoDayStmt.run({
        videoId: 'VID-HIGH',
        date,
        views: 1200,
        likes: 120,
        comments: 24,
        watchTimeMinutes: 2400,
        impressions: 15000,
        ctr: 0.08,
      });

      if (index < 45) {
        insertVideoDayStmt.run({
          videoId: 'VID-MED',
          date,
          views: 1100,
          likes: 100,
          comments: 20,
          watchTimeMinutes: 2100,
          impressions: 14000,
          ctr: 0.075,
        });
      }

      if (index < 10) {
        insertVideoDayStmt.run({
          videoId: 'VID-LOW',
          date,
          views: 900,
          likes: 60,
          comments: 12,
          watchTimeMinutes: 1500,
          impressions: 12000,
          ctr: 0.07,
        });
      }
    }

    const result = getQualityScores({
      db,
      channelId: 'UC-QS-001',
      dateFrom: '2025-01-01',
      dateTo: '2025-03-11',
      limit: 10,
      now: () => new Date('2026-02-17T10:10:00.000Z'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const confidenceByVideo = new Map(result.value.items.map((item) => [item.videoId, item.confidence]));
      expect(confidenceByVideo.get('VID-HIGH')).toBe('high');
      expect(confidenceByVideo.get('VID-MED')).toBe('medium');
      expect(confidenceByVideo.get('VID-LOW')).toBe('low');
    }

    const closeResult = connectionResult.value.close();
    expect(closeResult.ok).toBe(true);
  });
});
