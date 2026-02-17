import type Database from 'better-sqlite3';
import { AppError, err, ok, type Result } from '@moze/shared';

export interface PipelineRepository {
  clearStagingForChannel: (input: { channelId: string }) => Result<void, AppError>;
  insertStagedChannel: (input: {
    channelId: string;
    name: string;
    description: string;
    thumbnailUrl: string | null;
    publishedAt: string;
    subscriberCount: number;
    videoCount: number;
    viewCount: number;
    lastSyncAt: string | null;
    ingestedAt: string;
  }) => Result<void, AppError>;
  insertStagedVideo: (input: {
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
    ingestedAt: string;
  }) => Result<void, AppError>;
  deleteFeatureWindow: (input: {
    channelId: string;
    featureSetVersion: string;
    dateFrom: string;
    dateTo: string;
  }) => Result<void, AppError>;
  insertFeature: (input: {
    channelId: string;
    date: string;
    featureSetVersion: string;
    views7d: number;
    views30d: number;
    subscriberDelta7d: number;
    engagementRate7d: number;
    publishFrequency30d: number;
    daysSinceLastVideo: number | null;
    sourceSyncRunId: number | null;
    generatedAt: string;
  }) => Result<void, AppError>;
  insertLineage: (input: {
    pipelineStage: string;
    entityType: string;
    entityKey: string;
    sourceTable: string;
    sourceRecordCount: number;
    metadataJson: string;
    sourceSyncRunId: number | null;
    producedAt: string;
  }) => Result<void, AppError>;
  runInTransaction: <T>(operation: () => Result<T, AppError>) => Result<T, AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

export function createPipelineRepository(db: Database.Database): PipelineRepository {
  const deleteStgVideosStmt = db.prepare<{ channelId: string }>(
    `
      DELETE FROM stg_videos
      WHERE channel_id = @channelId
    `,
  );

  const deleteStgChannelStmt = db.prepare<{ channelId: string }>(
    `
      DELETE FROM stg_channels
      WHERE channel_id = @channelId
    `,
  );

  const insertStgChannelStmt = db.prepare<{
    channelId: string;
    name: string;
    description: string;
    thumbnailUrl: string | null;
    publishedAt: string;
    subscriberCount: number;
    videoCount: number;
    viewCount: number;
    lastSyncAt: string | null;
    ingestedAt: string;
  }>(
    `
      INSERT INTO stg_channels (
        channel_id,
        name,
        description,
        thumbnail_url,
        published_at,
        subscriber_count,
        video_count,
        view_count,
        last_sync_at,
        ingested_at
      )
      VALUES (
        @channelId,
        @name,
        @description,
        @thumbnailUrl,
        @publishedAt,
        @subscriberCount,
        @videoCount,
        @viewCount,
        @lastSyncAt,
        @ingestedAt
      )
    `,
  );

  const insertStgVideoStmt = db.prepare<{
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
    ingestedAt: string;
  }>(
    `
      INSERT INTO stg_videos (
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
        ingested_at
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
        @ingestedAt
      )
    `,
  );

  const deleteFeaturesStmt = db.prepare<{
    channelId: string;
    featureSetVersion: string;
    dateFrom: string;
    dateTo: string;
  }>(
    `
      DELETE FROM ml_features
      WHERE channel_id = @channelId
        AND feature_set_version = @featureSetVersion
        AND date >= @dateFrom
        AND date <= @dateTo
    `,
  );

  const insertFeatureStmt = db.prepare<{
    channelId: string;
    date: string;
    featureSetVersion: string;
    views7d: number;
    views30d: number;
    subscriberDelta7d: number;
    engagementRate7d: number;
    publishFrequency30d: number;
    daysSinceLastVideo: number | null;
    sourceSyncRunId: number | null;
    generatedAt: string;
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
        @featureSetVersion,
        @views7d,
        @views30d,
        @subscriberDelta7d,
        @engagementRate7d,
        @publishFrequency30d,
        @daysSinceLastVideo,
        @sourceSyncRunId,
        @generatedAt
      )
    `,
  );

  const insertLineageStmt = db.prepare<{
    pipelineStage: string;
    entityType: string;
    entityKey: string;
    sourceTable: string;
    sourceRecordCount: number;
    metadataJson: string;
    sourceSyncRunId: number | null;
    producedAt: string;
  }>(
    `
      INSERT INTO data_lineage (
        pipeline_stage,
        entity_type,
        entity_key,
        source_table,
        source_record_count,
        metadata_json,
        source_sync_run_id,
        produced_at
      )
      VALUES (
        @pipelineStage,
        @entityType,
        @entityKey,
        @sourceTable,
        @sourceRecordCount,
        @metadataJson,
        @sourceSyncRunId,
        @producedAt
      )
    `,
  );

  return {
    clearStagingForChannel: (input) => {
      try {
        deleteStgVideosStmt.run({ channelId: input.channelId });
        deleteStgChannelStmt.run({ channelId: input.channelId });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_PIPELINE_STAGING_CLEAR_FAILED',
            'Failed to clear pipeline staging tables.',
            'error',
            { channelId: input.channelId },
            toError(cause),
          ),
        );
      }
    },

    insertStagedChannel: (input) => {
      try {
        insertStgChannelStmt.run({
          channelId: input.channelId,
          name: input.name,
          description: input.description,
          thumbnailUrl: input.thumbnailUrl,
          publishedAt: input.publishedAt,
          subscriberCount: input.subscriberCount,
          videoCount: input.videoCount,
          viewCount: input.viewCount,
          lastSyncAt: input.lastSyncAt,
          ingestedAt: input.ingestedAt,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_PIPELINE_STG_CHANNEL_INSERT_FAILED',
            'Failed to save channel in pipeline staging.',
            'error',
            { channelId: input.channelId },
            toError(cause),
          ),
        );
      }
    },

    insertStagedVideo: (input) => {
      try {
        insertStgVideoStmt.run({
          videoId: input.videoId,
          channelId: input.channelId,
          title: input.title,
          description: input.description,
          publishedAt: input.publishedAt,
          durationSeconds: input.durationSeconds,
          viewCount: input.viewCount,
          likeCount: input.likeCount,
          commentCount: input.commentCount,
          thumbnailUrl: input.thumbnailUrl,
          ingestedAt: input.ingestedAt,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_PIPELINE_STG_VIDEO_INSERT_FAILED',
            'Failed to save video in pipeline staging.',
            'error',
            { channelId: input.channelId, videoId: input.videoId },
            toError(cause),
          ),
        );
      }
    },

    deleteFeatureWindow: (input) => {
      try {
        deleteFeaturesStmt.run({
          channelId: input.channelId,
          featureSetVersion: input.featureSetVersion,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_PIPELINE_FEATURES_DELETE_FAILED',
            'Failed to delete previous pipeline features.',
            'error',
            {
              channelId: input.channelId,
              featureSetVersion: input.featureSetVersion,
              dateFrom: input.dateFrom,
              dateTo: input.dateTo,
            },
            toError(cause),
          ),
        );
      }
    },

    insertFeature: (input) => {
      try {
        insertFeatureStmt.run({
          channelId: input.channelId,
          date: input.date,
          featureSetVersion: input.featureSetVersion,
          views7d: input.views7d,
          views30d: input.views30d,
          subscriberDelta7d: input.subscriberDelta7d,
          engagementRate7d: input.engagementRate7d,
          publishFrequency30d: input.publishFrequency30d,
          daysSinceLastVideo: input.daysSinceLastVideo,
          sourceSyncRunId: input.sourceSyncRunId,
          generatedAt: input.generatedAt,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_PIPELINE_FEATURE_INSERT_FAILED',
            'Failed to save pipeline feature.',
            'error',
            { channelId: input.channelId, date: input.date, featureSetVersion: input.featureSetVersion },
            toError(cause),
          ),
        );
      }
    },

    insertLineage: (input) => {
      try {
        insertLineageStmt.run({
          pipelineStage: input.pipelineStage,
          entityType: input.entityType,
          entityKey: input.entityKey,
          sourceTable: input.sourceTable,
          sourceRecordCount: input.sourceRecordCount,
          metadataJson: input.metadataJson,
          sourceSyncRunId: input.sourceSyncRunId,
          producedAt: input.producedAt,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_PIPELINE_LINEAGE_INSERT_FAILED',
            'Failed to save pipeline lineage entry.',
            'error',
            {
              pipelineStage: input.pipelineStage,
              entityType: input.entityType,
              entityKey: input.entityKey,
            },
            toError(cause),
          ),
        );
      }
    },

    runInTransaction: <T>(operation: () => Result<T, AppError>) => {
      const transactionErrorRef: { current: AppError | null } = { current: null };
      try {
        const transaction = db.transaction(() => {
          const result = operation();
          if (!result.ok) {
            transactionErrorRef.current = result.error;
            throw new Error(result.error.message);
          }
          return result.value;
        });
        return ok(transaction());
      } catch (cause) {
        if (transactionErrorRef.current !== null) {
          return err(transactionErrorRef.current);
        }
        return err(
          AppError.create(
            'DB_PIPELINE_TRANSACTION_FAILED',
            'Failed to execute pipeline transaction.',
            'error',
            {},
            toError(cause),
          ),
        );
      }
    },
  };
}
