import type Database from 'better-sqlite3';
import { AppError, err, ok, type Result } from '@moze/shared';

export interface CompetitorRepository {
  upsertCompetitorProfile: (input: {
    channelId: string;
    competitorChannelId: string;
    name: string;
    handle: string | null;
    nowIso: string;
  }) => Result<void, AppError>;
  upsertSnapshot: (input: {
    channelId: string;
    competitorChannelId: string;
    date: string;
    subscribers: number;
    views: number;
    videos: number;
    subscribersDelta: number;
    viewsDelta: number;
    videosDelta: number;
    nowIso: string;
  }) => Result<void, AppError>;
  runInTransaction: <T>(operation: () => Result<T, AppError>) => Result<T, AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

export function createCompetitorRepository(db: Database.Database): CompetitorRepository {
  const upsertCompetitorStmt = db.prepare<{
    channelId: string;
    competitorChannelId: string;
    name: string;
    handle: string | null;
    nowIso: string;
  }>(
    `
      INSERT INTO dim_competitor (
        channel_id,
        competitor_channel_id,
        name,
        handle,
        created_at,
        updated_at
      )
      VALUES (
        @channelId,
        @competitorChannelId,
        @name,
        @handle,
        @nowIso,
        @nowIso
      )
      ON CONFLICT(channel_id, competitor_channel_id)
      DO UPDATE SET
        name = excluded.name,
        handle = excluded.handle,
        updated_at = excluded.updated_at
    `,
  );

  const upsertSnapshotStmt = db.prepare<{
    channelId: string;
    competitorChannelId: string;
    date: string;
    subscribers: number;
    views: number;
    videos: number;
    subscribersDelta: number;
    viewsDelta: number;
    videosDelta: number;
    nowIso: string;
  }>(
    `
      INSERT INTO fact_competitor_day (
        channel_id,
        competitor_channel_id,
        date,
        subscribers,
        views,
        videos,
        subscribers_delta,
        views_delta,
        videos_delta,
        updated_at
      )
      VALUES (
        @channelId,
        @competitorChannelId,
        @date,
        @subscribers,
        @views,
        @videos,
        @subscribersDelta,
        @viewsDelta,
        @videosDelta,
        @nowIso
      )
      ON CONFLICT(channel_id, competitor_channel_id, date)
      DO UPDATE SET
        subscribers = excluded.subscribers,
        views = excluded.views,
        videos = excluded.videos,
        subscribers_delta = excluded.subscribers_delta,
        views_delta = excluded.views_delta,
        videos_delta = excluded.videos_delta,
        updated_at = excluded.updated_at
    `,
  );

  return {
    upsertCompetitorProfile: (input) => {
      try {
        upsertCompetitorStmt.run({
          channelId: input.channelId,
          competitorChannelId: input.competitorChannelId,
          name: input.name,
          handle: input.handle,
          nowIso: input.nowIso,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_COMPETITOR_PROFILE_UPSERT_FAILED',
            'Nie udalo sie zapisac profilu konkurenta.',
            'error',
            { channelId: input.channelId, competitorChannelId: input.competitorChannelId },
            toError(cause),
          ),
        );
      }
    },

    upsertSnapshot: (input) => {
      try {
        upsertSnapshotStmt.run({
          channelId: input.channelId,
          competitorChannelId: input.competitorChannelId,
          date: input.date,
          subscribers: input.subscribers,
          views: input.views,
          videos: input.videos,
          subscribersDelta: input.subscribersDelta,
          viewsDelta: input.viewsDelta,
          videosDelta: input.videosDelta,
          nowIso: input.nowIso,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_COMPETITOR_SNAPSHOT_UPSERT_FAILED',
            'Nie udalo sie zapisac snapshotu konkurencji.',
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

    runInTransaction: <T>(operation: () => Result<T, AppError>) => {
      try {
        const transaction = db.transaction(() => operation());
        return transaction();
      } catch (cause) {
        return err(
          AppError.create(
            'DB_COMPETITOR_TRANSACTION_FAILED',
            'Nie udalo sie wykonac transakcji konkurencji.',
            'error',
            {},
            toError(cause),
          ),
        );
      }
    },
  };
}
