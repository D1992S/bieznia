import type Database from 'better-sqlite3';
import { AppError, err, ok, type Result } from '@moze/shared';
import type {
  AppMetaEntryInput,
  ChannelSnapshotRecord,
  CreateSyncRunInput,
  GetChannelSnapshotInput,
  FinishSyncRunInput,
  GetLatestOpenSyncRunInput,
  GetSyncRunByIdInput,
  GetVideoSnapshotsInput,
  RawApiResponseInput,
  ResumeSyncRunInput,
  SyncRunRecord,
  UpdateSyncRunCheckpointInput,
  UpsertChannelDayInput,
  UpsertChannelInput,
  UpsertProfileInput,
  UpsertVideoDayInput,
  UpsertVideoInput,
  VideoSnapshotRecord,
} from './types.ts';

export interface CoreRepository {
  upsertProfile: (input: UpsertProfileInput) => Result<void, AppError>;
  setAppMetaEntry: (input: AppMetaEntryInput) => Result<void, AppError>;
  createSyncRun: (input: CreateSyncRunInput) => Result<number, AppError>;
  updateSyncRunCheckpoint: (input: UpdateSyncRunCheckpointInput) => Result<void, AppError>;
  resumeSyncRun: (input: ResumeSyncRunInput) => Result<void, AppError>;
  finishSyncRun: (input: FinishSyncRunInput) => Result<void, AppError>;
  getSyncRunById: (input: GetSyncRunByIdInput) => Result<SyncRunRecord | null, AppError>;
  getLatestOpenSyncRun: (input: GetLatestOpenSyncRunInput) => Result<SyncRunRecord | null, AppError>;
  getChannelSnapshot: (input: GetChannelSnapshotInput) => Result<ChannelSnapshotRecord | null, AppError>;
  getVideoSnapshots: (input: GetVideoSnapshotsInput) => Result<VideoSnapshotRecord[], AppError>;
  recordRawApiResponse: (input: RawApiResponseInput) => Result<number, AppError>;
  upsertChannel: (input: UpsertChannelInput) => Result<void, AppError>;
  upsertVideos: (inputs: readonly UpsertVideoInput[]) => Result<void, AppError>;
  upsertChannelDays: (inputs: readonly UpsertChannelDayInput[]) => Result<void, AppError>;
  upsertVideoDays: (inputs: readonly UpsertVideoDayInput[]) => Result<void, AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function toNumberId(value: number | bigint): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return value;
}

function toSqliteBool(value: boolean): number {
  return value ? 1 : 0;
}

function createDbError(
  code: string,
  message: string,
  context: Record<string, unknown>,
  cause: unknown,
): AppError {
  return AppError.create(code, message, 'error', context, toError(cause));
}

export function createCoreRepository(db: Database.Database): CoreRepository {
  const upsertProfileStmt = db.prepare<{
    id: string;
    name: string;
    isActive: number;
    createdAt: string;
    updatedAt: string;
  }>(
    `
      INSERT INTO profiles (id, name, is_active, created_at, updated_at)
      VALUES (@id, @name, @isActive, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        is_active = excluded.is_active,
        updated_at = excluded.updated_at
    `,
  );

  const upsertAppMetaStmt = db.prepare<{ key: string; value: string; updatedAt: string }>(
    `
      INSERT INTO app_meta (key, value, updated_at)
      VALUES (@key, @value, @updatedAt)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
  );

  const createSyncRunStmt = db.prepare<{
    profileId: string | null;
    status: string;
    stage: string | null;
    startedAt: string;
  }>(
    `
      INSERT INTO sync_runs (profile_id, status, stage, started_at)
      VALUES (@profileId, @status, @stage, @startedAt)
    `,
  );

  const finishSyncRunStmt = db.prepare<{
    syncRunId: number;
    status: string;
    stage: string | null;
    finishedAt: string;
    errorCode: string | null;
    errorMessage: string | null;
  }>(
    `
      UPDATE sync_runs
      SET
        status = @status,
        stage = @stage,
        finished_at = @finishedAt,
        error_code = @errorCode,
        error_message = @errorMessage
      WHERE id = @syncRunId
    `,
  );

  const updateSyncRunCheckpointStmt = db.prepare<{
    syncRunId: number;
    status: string;
    stage: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  }>(
    `
      UPDATE sync_runs
      SET
        status = @status,
        stage = @stage,
        error_code = @errorCode,
        error_message = @errorMessage
      WHERE id = @syncRunId
    `,
  );

  const resumeSyncRunStmt = db.prepare<{
    syncRunId: number;
    status: string;
    stage: string | null;
  }>(
    `
      UPDATE sync_runs
      SET
        status = @status,
        stage = @stage,
        finished_at = NULL,
        error_code = NULL,
        error_message = NULL
      WHERE id = @syncRunId
    `,
  );

  const getSyncRunByIdStmt = db.prepare<{ syncRunId: number }, SyncRunRecord>(
    `
      SELECT
        id,
        profile_id AS profileId,
        status,
        stage,
        started_at AS startedAt,
        finished_at AS finishedAt,
        error_code AS errorCode,
        error_message AS errorMessage
      FROM sync_runs
      WHERE id = @syncRunId
      ORDER BY id ASC
      LIMIT 1
    `,
  );

  const getLatestOpenSyncRunStmt = db.prepare<{ profileId: string | null }, SyncRunRecord>(
    `
      SELECT
        id,
        profile_id AS profileId,
        status,
        stage,
        started_at AS startedAt,
        finished_at AS finishedAt,
        error_code AS errorCode,
        error_message AS errorMessage
      FROM sync_runs
      WHERE status = 'running'
        AND finished_at IS NULL
        AND (@profileId IS NULL OR profile_id = @profileId)
      ORDER BY started_at DESC, id DESC
      LIMIT 1
    `,
  );

  const getChannelSnapshotStmt = db.prepare<{ channelId: string }, ChannelSnapshotRecord>(
    `
      SELECT
        channel_id AS channelId,
        subscriber_count AS subscriberCount,
        video_count AS videoCount,
        view_count AS viewCount
      FROM dim_channel
      WHERE channel_id = @channelId
      ORDER BY channel_id ASC
      LIMIT 1
    `,
  );

  const getVideoSnapshotStmt = db.prepare<{ videoId: string }, VideoSnapshotRecord>(
    `
      SELECT
        video_id AS videoId,
        view_count AS viewCount,
        like_count AS likeCount,
        comment_count AS commentCount
      FROM dim_video
      WHERE video_id = @videoId
      ORDER BY video_id ASC
      LIMIT 1
    `,
  );

  const insertRawApiResponseStmt = db.prepare<{
    source: string;
    endpoint: string;
    requestParamsJson: string | null;
    responseBodyJson: string;
    httpStatus: number;
    fetchedAt: string;
    syncRunId: number | null;
  }>(
    `
      INSERT INTO raw_api_responses (
        source,
        endpoint,
        request_params_json,
        response_body_json,
        http_status,
        fetched_at,
        sync_run_id
      )
      VALUES (
        @source,
        @endpoint,
        @requestParamsJson,
        @responseBodyJson,
        @httpStatus,
        @fetchedAt,
        @syncRunId
      )
    `,
  );

  const upsertChannelStmt = db.prepare<{
    channelId: string;
    profileId: string | null;
    name: string;
    description: string;
    thumbnailUrl: string | null;
    publishedAt: string;
    subscriberCount: number;
    videoCount: number;
    viewCount: number;
    lastSyncAt: string | null;
    updatedAt: string;
  }>(
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
      ON CONFLICT(channel_id) DO UPDATE SET
        profile_id = excluded.profile_id,
        name = excluded.name,
        description = excluded.description,
        thumbnail_url = excluded.thumbnail_url,
        published_at = excluded.published_at,
        subscriber_count = excluded.subscriber_count,
        video_count = excluded.video_count,
        view_count = excluded.view_count,
        last_sync_at = excluded.last_sync_at,
        updated_at = excluded.updated_at
    `,
  );

  const upsertVideoStmt = db.prepare<{
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
    updatedAt: string;
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
        @channelId,
        @title,
        @description,
        @publishedAt,
        @durationSeconds,
        @viewCount,
        @likeCount,
        @commentCount,
        @thumbnailUrl,
        @updatedAt
      )
      ON CONFLICT(video_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        title = excluded.title,
        description = excluded.description,
        published_at = excluded.published_at,
        duration_seconds = excluded.duration_seconds,
        view_count = excluded.view_count,
        like_count = excluded.like_count,
        comment_count = excluded.comment_count,
        thumbnail_url = excluded.thumbnail_url,
        updated_at = excluded.updated_at
    `,
  );

  const upsertChannelDayStmt = db.prepare<{
    channelId: string;
    date: string;
    subscribers: number;
    views: number;
    videos: number;
    likes: number;
    comments: number;
    watchTimeMinutes: number | null;
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
        @watchTimeMinutes,
        @updatedAt
      )
      ON CONFLICT(channel_id, date) DO UPDATE SET
        subscribers = excluded.subscribers,
        views = fact_channel_day.views + excluded.views,
        videos = excluded.videos,
        likes = fact_channel_day.likes + excluded.likes,
        comments = fact_channel_day.comments + excluded.comments,
        watch_time_minutes = COALESCE(excluded.watch_time_minutes, fact_channel_day.watch_time_minutes),
        updated_at = excluded.updated_at
    `,
  );

  const upsertVideoDayStmt = db.prepare<{
    videoId: string;
    channelId: string;
    date: string;
    views: number;
    likes: number;
    comments: number;
    watchTimeMinutes: number | null;
    impressions: number | null;
    ctr: number | null;
    updatedAt: string;
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
        @channelId,
        @date,
        @views,
        @likes,
        @comments,
        @watchTimeMinutes,
        @impressions,
        @ctr,
        @updatedAt
      )
      ON CONFLICT(video_id, date) DO UPDATE SET
        channel_id = excluded.channel_id,
        views = fact_video_day.views + excluded.views,
        likes = fact_video_day.likes + excluded.likes,
        comments = fact_video_day.comments + excluded.comments,
        watch_time_minutes = COALESCE(excluded.watch_time_minutes, fact_video_day.watch_time_minutes),
        impressions = COALESCE(excluded.impressions, fact_video_day.impressions),
        ctr = COALESCE(excluded.ctr, fact_video_day.ctr),
        updated_at = excluded.updated_at
    `,
  );

  const upsertVideosTx = db.transaction((inputs: readonly UpsertVideoInput[]) => {
    for (const input of inputs) {
      upsertVideoStmt.run({
        videoId: input.videoId,
        channelId: input.channelId,
        title: input.title,
        description: input.description,
        publishedAt: input.publishedAt,
        durationSeconds: input.durationSeconds ?? null,
        viewCount: input.viewCount,
        likeCount: input.likeCount,
        commentCount: input.commentCount,
        thumbnailUrl: input.thumbnailUrl ?? null,
        updatedAt: input.updatedAt ?? new Date().toISOString(),
      });
    }
  });

  const upsertChannelDaysTx = db.transaction((inputs: readonly UpsertChannelDayInput[]) => {
    for (const input of inputs) {
      upsertChannelDayStmt.run({
        channelId: input.channelId,
        date: input.date,
        subscribers: input.subscribers,
        views: input.views,
        videos: input.videos,
        likes: input.likes,
        comments: input.comments,
        watchTimeMinutes: input.watchTimeMinutes ?? null,
        updatedAt: input.updatedAt ?? new Date().toISOString(),
      });
    }
  });

  const upsertVideoDaysTx = db.transaction((inputs: readonly UpsertVideoDayInput[]) => {
    for (const input of inputs) {
      upsertVideoDayStmt.run({
        videoId: input.videoId,
        channelId: input.channelId,
        date: input.date,
        views: input.views,
        likes: input.likes,
        comments: input.comments,
        watchTimeMinutes: input.watchTimeMinutes ?? null,
        impressions: input.impressions ?? null,
        ctr: input.ctr ?? null,
        updatedAt: input.updatedAt ?? new Date().toISOString(),
      });
    }
  });

  return {
    upsertProfile: (input) => {
      try {
        const now = new Date().toISOString();
        upsertProfileStmt.run({
          id: input.id,
          name: input.name,
          isActive: toSqliteBool(input.isActive),
          createdAt: input.createdAt ?? now,
          updatedAt: input.updatedAt ?? now,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          createDbError('DB_PROFILE_UPSERT_FAILED', 'Nie udało się zapisać profilu.', { profileId: input.id }, cause),
        );
      }
    },

    setAppMetaEntry: (input) => {
      try {
        upsertAppMetaStmt.run({
          key: input.key,
          value: input.value,
          updatedAt: input.updatedAt ?? new Date().toISOString(),
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          createDbError(
            'DB_APP_META_UPSERT_FAILED',
            'Nie udało się zapisać metadanych aplikacji.',
            { key: input.key },
            cause,
          ),
        );
      }
    },

    createSyncRun: (input) => {
      try {
        const runResult = createSyncRunStmt.run({
          profileId: input.profileId ?? null,
          status: input.status,
          stage: input.stage ?? null,
          startedAt: input.startedAt,
        });
        return ok(toNumberId(runResult.lastInsertRowid));
      } catch (cause) {
        return err(
          createDbError(
            'DB_SYNC_RUN_CREATE_FAILED',
            'Nie udało się utworzyć rekordu synchronizacji.',
            { status: input.status, profileId: input.profileId ?? null },
            cause,
          ),
        );
      }
    },

    updateSyncRunCheckpoint: (input) => {
      try {
        updateSyncRunCheckpointStmt.run({
          syncRunId: input.syncRunId,
          status: input.status,
          stage: input.stage ?? null,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          createDbError(
            'DB_SYNC_RUN_CHECKPOINT_FAILED',
            'Nie udalo sie zaktualizowac checkpointu synchronizacji.',
            { syncRunId: input.syncRunId, status: input.status, stage: input.stage ?? null },
            cause,
          ),
        );
      }
    },

    resumeSyncRun: (input) => {
      try {
        resumeSyncRunStmt.run({
          syncRunId: input.syncRunId,
          status: input.status,
          stage: input.stage ?? null,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          createDbError(
            'DB_SYNC_RUN_RESUME_FAILED',
            'Nie udalo sie wznowic rekordu synchronizacji.',
            { syncRunId: input.syncRunId, status: input.status, stage: input.stage ?? null },
            cause,
          ),
        );
      }
    },

    finishSyncRun: (input) => {
      try {
        finishSyncRunStmt.run({
          syncRunId: input.syncRunId,
          status: input.status,
          stage: input.stage ?? null,
          finishedAt: input.finishedAt,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          createDbError(
            'DB_SYNC_RUN_FINISH_FAILED',
            'Nie udało się zakończyć rekordu synchronizacji.',
            { syncRunId: input.syncRunId, status: input.status },
            cause,
          ),
        );
      }
    },

    getSyncRunById: (input) => {
      try {
        return ok(getSyncRunByIdStmt.get({ syncRunId: input.syncRunId }) ?? null);
      } catch (cause) {
        return err(
          createDbError(
            'DB_SYNC_RUN_GET_FAILED',
            'Nie udalo sie odczytac rekordu synchronizacji.',
            { syncRunId: input.syncRunId },
            cause,
          ),
        );
      }
    },

    getLatestOpenSyncRun: (input) => {
      try {
        return ok(getLatestOpenSyncRunStmt.get({ profileId: input.profileId ?? null }) ?? null);
      } catch (cause) {
        return err(
          createDbError(
            'DB_SYNC_RUN_OPEN_GET_FAILED',
            'Nie udalo sie odczytac aktywnego sync run.',
            { profileId: input.profileId ?? null },
            cause,
          ),
        );
      }
    },

    getChannelSnapshot: (input) => {
      try {
        return ok(getChannelSnapshotStmt.get({ channelId: input.channelId }) ?? null);
      } catch (cause) {
        return err(
          createDbError(
            'DB_CHANNEL_SNAPSHOT_GET_FAILED',
            'Nie udalo sie odczytac snapshotu kanalu.',
            { channelId: input.channelId },
            cause,
          ),
        );
      }
    },

    getVideoSnapshots: (input) => {
      try {
        const uniqueVideoIds = [...new Set(input.videoIds)];
        const snapshots: VideoSnapshotRecord[] = [];
        for (const videoId of uniqueVideoIds) {
          const row = getVideoSnapshotStmt.get({ videoId });
          if (row) {
            snapshots.push(row);
          }
        }
        return ok(snapshots);
      } catch (cause) {
        return err(
          createDbError(
            'DB_VIDEO_SNAPSHOTS_GET_FAILED',
            'Nie udalo sie odczytac snapshotow filmow.',
            { requestedItems: input.videoIds.length },
            cause,
          ),
        );
      }
    },

    recordRawApiResponse: (input) => {
      try {
        const insertResult = insertRawApiResponseStmt.run({
          source: input.source,
          endpoint: input.endpoint,
          requestParamsJson: input.requestParamsJson ?? null,
          responseBodyJson: input.responseBodyJson,
          httpStatus: input.httpStatus,
          fetchedAt: input.fetchedAt,
          syncRunId: input.syncRunId ?? null,
        });
        return ok(toNumberId(insertResult.lastInsertRowid));
      } catch (cause) {
        return err(
          createDbError(
            'DB_RAW_RESPONSE_INSERT_FAILED',
            'Nie udało się zapisać surowej odpowiedzi API.',
            { source: input.source, endpoint: input.endpoint },
            cause,
          ),
        );
      }
    },

    upsertChannel: (input) => {
      try {
        upsertChannelStmt.run({
          channelId: input.channelId,
          profileId: input.profileId ?? null,
          name: input.name,
          description: input.description,
          thumbnailUrl: input.thumbnailUrl ?? null,
          publishedAt: input.publishedAt,
          subscriberCount: input.subscriberCount,
          videoCount: input.videoCount,
          viewCount: input.viewCount,
          lastSyncAt: input.lastSyncAt ?? null,
          updatedAt: input.updatedAt ?? new Date().toISOString(),
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          createDbError(
            'DB_CHANNEL_UPSERT_FAILED',
            'Nie udało się zapisać danych kanału.',
            { channelId: input.channelId },
            cause,
          ),
        );
      }
    },

    upsertVideos: (inputs) => {
      try {
        upsertVideosTx(inputs);
        return ok(undefined);
      } catch (cause) {
        return err(
          createDbError(
            'DB_VIDEOS_UPSERT_FAILED',
            'Nie udało się zapisać danych filmów.',
            { items: inputs.length },
            cause,
          ),
        );
      }
    },

    upsertChannelDays: (inputs) => {
      try {
        upsertChannelDaysTx(inputs);
        return ok(undefined);
      } catch (cause) {
        return err(
          createDbError(
            'DB_CHANNEL_DAY_UPSERT_FAILED',
            'Nie udało się zapisać dziennych metryk kanału.',
            { items: inputs.length },
            cause,
          ),
        );
      }
    },

    upsertVideoDays: (inputs) => {
      try {
        upsertVideoDaysTx(inputs);
        return ok(undefined);
      } catch (cause) {
        return err(
          createDbError(
            'DB_VIDEO_DAY_UPSERT_FAILED',
            'Nie udało się zapisać dziennych metryk filmów.',
            { items: inputs.length },
            cause,
          ),
        );
      }
    },
  };
}
