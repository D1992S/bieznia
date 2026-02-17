import type Database from 'better-sqlite3';
import { AppError, err, ok, type Result } from '@moze/shared';

export interface PipelineChannelWarehouseRow {
  channelId: string;
  name: string;
  description: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  lastSyncAt: string | null;
}

export interface PipelineVideoWarehouseRow {
  videoId: string;
  channelId: string;
  title: string;
  description: string;
  publishedAt: string;
  durationSeconds: number | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string | null;
}

export interface PipelineChannelDayWarehouseRow {
  channelId: string;
  date: string;
  subscribers: number;
  views: number;
  videos: number;
  likes: number;
  comments: number;
  watchTimeMinutes: number | null;
}

export interface PipelineQueries {
  getChannelWarehouseRow: (input: { channelId: string }) => Result<PipelineChannelWarehouseRow | null, AppError>;
  listVideoWarehouseRows: (input: { channelId: string }) => Result<PipelineVideoWarehouseRow[], AppError>;
  listChannelDayWarehouseRows: (input: { channelId: string }) => Result<PipelineChannelDayWarehouseRow[], AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

export function createPipelineQueries(db: Database.Database): PipelineQueries {
  const getChannelStmt = db.prepare<{ channelId: string }, PipelineChannelWarehouseRow>(
    `
      SELECT
        channel_id AS channelId,
        name,
        description,
        thumbnail_url AS thumbnailUrl,
        published_at AS publishedAt,
        subscriber_count AS subscriberCount,
        video_count AS videoCount,
        view_count AS viewCount,
        last_sync_at AS lastSyncAt
      FROM dim_channel
      WHERE channel_id = @channelId
      ORDER BY channel_id ASC
      LIMIT 1
    `,
  );

  const listVideosStmt = db.prepare<{ channelId: string }, PipelineVideoWarehouseRow>(
    `
      SELECT
        video_id AS videoId,
        channel_id AS channelId,
        title,
        description,
        published_at AS publishedAt,
        duration_seconds AS durationSeconds,
        view_count AS viewCount,
        like_count AS likeCount,
        comment_count AS commentCount,
        thumbnail_url AS thumbnailUrl
      FROM dim_video
      WHERE channel_id = @channelId
      ORDER BY published_at ASC, video_id ASC
    `,
  );

  const listChannelDaysStmt = db.prepare<{ channelId: string }, PipelineChannelDayWarehouseRow>(
    `
      SELECT
        channel_id AS channelId,
        date,
        subscribers,
        views,
        videos,
        likes,
        comments,
        watch_time_minutes AS watchTimeMinutes
      FROM fact_channel_day
      WHERE channel_id = @channelId
      ORDER BY date ASC
    `,
  );

  return {
    getChannelWarehouseRow: (input) => {
      try {
        return ok(getChannelStmt.get({ channelId: input.channelId }) ?? null);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_PIPELINE_CHANNEL_READ_FAILED',
            'Nie udalo sie odczytac kanalu do pipeline.',
            'error',
            { channelId: input.channelId },
            toError(cause),
          ),
        );
      }
    },

    listVideoWarehouseRows: (input) => {
      try {
        return ok(listVideosStmt.all({ channelId: input.channelId }));
      } catch (cause) {
        return err(
          AppError.create(
            'DB_PIPELINE_VIDEOS_READ_FAILED',
            'Nie udalo sie odczytac filmow do pipeline.',
            'error',
            { channelId: input.channelId },
            toError(cause),
          ),
        );
      }
    },

    listChannelDayWarehouseRows: (input) => {
      try {
        return ok(listChannelDaysStmt.all({ channelId: input.channelId }));
      } catch (cause) {
        return err(
          AppError.create(
            'DB_PIPELINE_CHANNEL_DAYS_READ_FAILED',
            'Nie udalo sie odczytac dziennych metryk kanalu do pipeline.',
            'error',
            { channelId: input.channelId },
            toError(cause),
          ),
        );
      }
    },
  };
}
