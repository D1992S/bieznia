import { describe, expect, it } from 'vitest';
import { createDatabaseConnection } from './database.ts';
import { runMigrations } from './migrations/index.ts';
import { createAppStatusQueries } from './queries/app-status-queries.ts';

describe('app-status queries integration', () => {
  it('returns null values when sync/channel data is missing', () => {
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

    const queries = createAppStatusQueries(connectionResult.value.db);

    const latestSyncResult = queries.getLatestSyncRunStatus();
    expect(latestSyncResult.ok).toBe(true);
    if (!latestSyncResult.ok) {
      return;
    }
    expect(latestSyncResult.value).toBeNull();

    const latestChannelSyncResult = queries.getLatestChannelSyncAt();
    expect(latestChannelSyncResult.ok).toBe(true);
    if (!latestChannelSyncResult.ok) {
      return;
    }
    expect(latestChannelSyncResult.value).toBeNull();

    const latestFinishedSyncResult = queries.getLatestFinishedSyncAt();
    expect(latestFinishedSyncResult.ok).toBe(true);
    if (!latestFinishedSyncResult.ok) {
      return;
    }
    expect(latestFinishedSyncResult.value).toBeNull();

    const closeResult = connectionResult.value.close();
    expect(closeResult.ok).toBe(true);
  });

  it('returns latest sync and channel timestamps deterministically', () => {
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
        INSERT INTO sync_runs (profile_id, status, stage, started_at, finished_at)
        VALUES (@profileId, @status, @stage, @startedAt, @finishedAt)
      `,
    ).run({
      profileId: null,
      status: 'running',
      stage: 'fetch',
      startedAt: '2026-02-16T10:00:00.000Z',
      finishedAt: null,
    });
    db.prepare(
      `
        INSERT INTO sync_runs (profile_id, status, stage, started_at, finished_at)
        VALUES (@profileId, @status, @stage, @startedAt, @finishedAt)
      `,
    ).run({
      profileId: null,
      status: 'completed',
      stage: 'done',
      startedAt: '2026-02-16T12:00:00.000Z',
      finishedAt: '2026-02-16T12:30:00.000Z',
    });

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
          @profileId,
          @name,
          @description,
          @thumbnailUrl,
          @publishedAt,
          @subscriberCount,
          @videoCount,
          @viewCount,
          @lastSyncAt,
          @updatedAt
        )
      `,
    ).run({
      channelId: 'CH-001',
      profileId: null,
      name: 'Kanal testowy',
      description: 'Opis',
      thumbnailUrl: null,
      publishedAt: '2026-01-01T00:00:00.000Z',
      subscriberCount: 100,
      videoCount: 10,
      viewCount: 2_000,
      lastSyncAt: '2026-02-16T12:31:00.000Z',
      updatedAt: '2026-02-16T12:31:00.000Z',
    });

    const queries = createAppStatusQueries(db);

    const latestSyncResult = queries.getLatestSyncRunStatus();
    expect(latestSyncResult.ok).toBe(true);
    if (!latestSyncResult.ok) {
      return;
    }
    expect(latestSyncResult.value?.status).toBe('completed');
    expect(latestSyncResult.value?.finishedAt).toBe('2026-02-16T12:30:00.000Z');

    const latestChannelSyncResult = queries.getLatestChannelSyncAt();
    expect(latestChannelSyncResult.ok).toBe(true);
    if (!latestChannelSyncResult.ok) {
      return;
    }
    expect(latestChannelSyncResult.value).toBe('2026-02-16T12:31:00.000Z');

    const latestFinishedSyncResult = queries.getLatestFinishedSyncAt();
    expect(latestFinishedSyncResult.ok).toBe(true);
    if (!latestFinishedSyncResult.ok) {
      return;
    }
    expect(latestFinishedSyncResult.value).toBe('2026-02-16T12:30:00.000Z');

    const closeResult = connectionResult.value.close();
    expect(closeResult.ok).toBe(true);
  });
});
