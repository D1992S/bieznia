import type Database from 'better-sqlite3';
import { AppError, err, ok, type Result } from '@moze/shared';

export interface CompetitorOwnerDayRow {
  date: string;
  subscribers: number;
  views: number;
  videos: number;
}

export interface CompetitorSnapshotRow {
  competitorChannelId: string;
  name: string;
  handle: string | null;
  date: string;
  subscribers: number;
  views: number;
  videos: number;
}

export interface CompetitorPersistedSnapshotRow {
  subscribers: number;
  views: number;
  videos: number;
  subscribersDelta: number;
  viewsDelta: number;
  videosDelta: number;
}

export interface CompetitorQueries {
  listOwnerDayRows: (input: {
    channelId: string;
    dateFrom: string;
    dateTo: string;
  }) => Result<CompetitorOwnerDayRow[], AppError>;
  getPersistedSnapshot: (input: {
    channelId: string;
    competitorChannelId: string;
    date: string;
  }) => Result<CompetitorPersistedSnapshotRow | null, AppError>;
  listSnapshotsInRange: (input: {
    channelId: string;
    dateFrom: string;
    dateTo: string;
  }) => Result<CompetitorSnapshotRow[], AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

export function createCompetitorQueries(db: Database.Database): CompetitorQueries {
  const listOwnerDaysStmt = db.prepare<
    { channelId: string; dateFrom: string; dateTo: string },
    CompetitorOwnerDayRow
  >(
    `
      SELECT
        date,
        subscribers,
        views,
        videos
      FROM fact_channel_day
      WHERE channel_id = @channelId
        AND date BETWEEN @dateFrom AND @dateTo
      ORDER BY date ASC
    `,
  );

  const getPersistedSnapshotStmt = db.prepare<
    { channelId: string; competitorChannelId: string; date: string },
    CompetitorPersistedSnapshotRow
  >(
    `
      SELECT
        subscribers,
        views,
        videos,
        subscribers_delta AS subscribersDelta,
        views_delta AS viewsDelta,
        videos_delta AS videosDelta
      FROM fact_competitor_day
      WHERE channel_id = @channelId
        AND competitor_channel_id = @competitorChannelId
        AND date = @date
      ORDER BY date ASC
      LIMIT 1
    `,
  );

  const listSnapshotsStmt = db.prepare<
    { channelId: string; dateFrom: string; dateTo: string },
    CompetitorSnapshotRow
  >(
    `
      SELECT
        f.competitor_channel_id AS competitorChannelId,
        d.name AS name,
        d.handle AS handle,
        f.date AS date,
        f.subscribers AS subscribers,
        f.views AS views,
        f.videos AS videos
      FROM fact_competitor_day AS f
      INNER JOIN dim_competitor AS d
        ON d.channel_id = f.channel_id
       AND d.competitor_channel_id = f.competitor_channel_id
      WHERE f.channel_id = @channelId
        AND f.date BETWEEN @dateFrom AND @dateTo
      ORDER BY f.competitor_channel_id ASC, f.date ASC
    `,
  );

  return {
    listOwnerDayRows: (input) => {
      try {
        return ok(
          listOwnerDaysStmt.all({
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
          }),
        );
      } catch (cause) {
        return err(
          AppError.create(
            'DB_COMPETITOR_OWNER_DAYS_READ_FAILED',
            'Failed to read channel metrics for competitor analysis.',
            'error',
            { channelId: input.channelId, dateFrom: input.dateFrom, dateTo: input.dateTo },
            toError(cause),
          ),
        );
      }
    },

    getPersistedSnapshot: (input) => {
      try {
        return ok(
          getPersistedSnapshotStmt.get({
            channelId: input.channelId,
            competitorChannelId: input.competitorChannelId,
            date: input.date,
          }) ?? null,
        );
      } catch (cause) {
        return err(
          AppError.create(
            'DB_COMPETITOR_SNAPSHOT_READ_FAILED',
            'Failed to read persisted competitor snapshot.',
            'error',
            {
              channelId: input.channelId,
              competitorChannelId: input.competitorChannelId,
              date: input.date,
            },
            toError(cause),
          ),
        );
      }
    },

    listSnapshotsInRange: (input) => {
      try {
        return ok(
          listSnapshotsStmt.all({
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
          }),
        );
      } catch (cause) {
        return err(
          AppError.create(
            'DB_COMPETITOR_SNAPSHOTS_READ_FAILED',
            'Failed to read competitor snapshot data.',
            'error',
            { channelId: input.channelId, dateFrom: input.dateFrom, dateTo: input.dateTo },
            toError(cause),
          ),
        );
      }
    },
  };
}
