import type Database from 'better-sqlite3';
import { AppError, err, ok, type Result } from '@moze/shared';

export interface QualityVideoAggregateRow {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: string;
  durationSeconds: number;
  activeDays: number;
  viewsSum: number;
  likesSum: number;
  commentsSum: number;
  watchTimeMinutesSum: number;
  viewsAvg: number;
  viewsSquaredAvg: number;
}

export interface QualityQueries {
  getAverageSubscribersInRange: (input: {
    channelId: string;
    dateFrom: string;
    dateTo: string;
  }) => Result<number | null, AppError>;
  getChannelSubscriberCount: (input: { channelId: string }) => Result<number | null, AppError>;
  listVideoAggregates: (input: {
    channelId: string;
    dateFrom: string;
    dateTo: string;
  }) => Result<QualityVideoAggregateRow[], AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

export function createQualityQueries(db: Database.Database): QualityQueries {
  const getRangeAverageStmt = db.prepare<
    { channelId: string; dateFrom: string; dateTo: string },
    { avgSubscribers: number | null }
  >(
    `
      SELECT AVG(subscribers) AS avgSubscribers
      FROM fact_channel_day
      WHERE channel_id = @channelId
        AND date BETWEEN @dateFrom AND @dateTo
    `,
  );

  const getChannelSubscriberCountStmt = db.prepare<{ channelId: string }, { subscriberCount: number }>(
    `
      SELECT subscriber_count AS subscriberCount
      FROM dim_channel
      WHERE channel_id = @channelId
      ORDER BY channel_id ASC
      LIMIT 1
    `,
  );

  const listAggregatesStmt = db.prepare<
    { channelId: string; dateFrom: string; dateTo: string },
    QualityVideoAggregateRow
  >(
    `
      SELECT
        v.video_id AS videoId,
        v.channel_id AS channelId,
        v.title AS title,
        v.published_at AS publishedAt,
        COALESCE(v.duration_seconds, 0) AS durationSeconds,
        COUNT(*) AS activeDays,
        SUM(f.views) AS viewsSum,
        SUM(f.likes) AS likesSum,
        SUM(f.comments) AS commentsSum,
        SUM(COALESCE(f.watch_time_minutes, 0)) AS watchTimeMinutesSum,
        AVG(f.views) AS viewsAvg,
        AVG(CAST(f.views AS REAL) * CAST(f.views AS REAL)) AS viewsSquaredAvg
      FROM fact_video_day AS f
      INNER JOIN dim_video AS v
        ON v.video_id = f.video_id
      WHERE f.channel_id = @channelId
        AND f.date BETWEEN @dateFrom AND @dateTo
      GROUP BY v.video_id, v.channel_id, v.title, v.published_at, v.duration_seconds
      ORDER BY v.video_id ASC
    `,
  );

  return {
    getAverageSubscribersInRange: (input) => {
      try {
        const row = getRangeAverageStmt.get({
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        });
        if (typeof row?.avgSubscribers === 'number' && Number.isFinite(row.avgSubscribers)) {
          return ok(row.avgSubscribers);
        }
        return ok(null);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_QUALITY_AVG_SUBSCRIBERS_READ_FAILED',
            'Nie udalo sie odczytac sredniej liczby subskrybentow.',
            'error',
            { channelId: input.channelId, dateFrom: input.dateFrom, dateTo: input.dateTo },
            toError(cause),
          ),
        );
      }
    },

    getChannelSubscriberCount: (input) => {
      try {
        const row = getChannelSubscriberCountStmt.get({ channelId: input.channelId });
        return ok(typeof row?.subscriberCount === 'number' ? row.subscriberCount : null);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_QUALITY_CHANNEL_SUBSCRIBERS_READ_FAILED',
            'Nie udalo sie odczytac liczby subskrybentow kanalu.',
            'error',
            { channelId: input.channelId },
            toError(cause),
          ),
        );
      }
    },

    listVideoAggregates: (input) => {
      try {
        return ok(
          listAggregatesStmt.all({
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
          }),
        );
      } catch (cause) {
        return err(
          AppError.create(
            'DB_QUALITY_VIDEO_AGGREGATES_READ_FAILED',
            'Nie udalo sie odczytac agregatow quality scoring.',
            'error',
            { channelId: input.channelId, dateFrom: input.dateFrom, dateTo: input.dateTo },
            toError(cause),
          ),
        );
      }
    },
  };
}
