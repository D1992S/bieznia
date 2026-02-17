import type { DatabaseConnection } from '@moze/core';
import { AppError, err, ok, type Result } from '@moze/shared';
import { z } from 'zod/v4';

const DEFAULT_FEATURE_SET_VERSION = 'v1';
const DEFAULT_MAX_FRESHNESS_DAYS = 365;
const DAY_MS = 86_400_000;

const ChannelWarehouseRowSchema = z.object({
  channelId: z.string(),
  name: z.string(),
  description: z.string(),
  thumbnailUrl: z.string().nullable(),
  publishedAt: z.string().min(1),
  subscriberCount: z.number().int().nonnegative(),
  videoCount: z.number().int().nonnegative(),
  viewCount: z.number().int().nonnegative(),
  lastSyncAt: z.string().nullable(),
});

type ChannelWarehouseRow = z.infer<typeof ChannelWarehouseRowSchema>;

const VideoWarehouseRowSchema = z.object({
  videoId: z.string(),
  channelId: z.string(),
  title: z.string(),
  description: z.string(),
  publishedAt: z.string().min(1),
  durationSeconds: z.number().int().nonnegative().nullable(),
  viewCount: z.number().int().nonnegative(),
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  thumbnailUrl: z.string().nullable(),
});

type VideoWarehouseRow = z.infer<typeof VideoWarehouseRowSchema>;

const ChannelDayWarehouseRowSchema = z.object({
  channelId: z.string(),
  date: z.iso.date(),
  subscribers: z.number().int().nonnegative(),
  views: z.number().int().nonnegative(),
  videos: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  watchTimeMinutes: z.number().int().nonnegative().nullable(),
});

type ChannelDayWarehouseRow = z.infer<typeof ChannelDayWarehouseRowSchema>;

interface WarehouseSnapshot {
  channel: ChannelWarehouseRow;
  videos: VideoWarehouseRow[];
  channelDays: ChannelDayWarehouseRow[];
}

interface ValidatedWarehouseSnapshot extends WarehouseSnapshot {
  videoPublishDayNumbers: number[];
}

interface FeatureRow {
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
}

interface FeatureWriteWindow {
  dateFrom: string;
  dateTo: string;
}

export interface RunDataPipelineInput {
  db: DatabaseConnection['db'];
  channelId: string;
  sourceSyncRunId?: number | null;
  featureSetVersion?: string;
  maxFreshnessDays?: number;
  changedDateFrom?: string | null;
  changedDateTo?: string | null;
  now?: () => Date;
}

export interface DataPipelineRunResult {
  channelId: string;
  featureSetVersion: string;
  sourceSyncRunId: number | null;
  stagedChannels: number;
  stagedVideos: number;
  generatedFeatures: number;
  lineageEntries: number;
  latestFeatureDate: string | null;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function toUtcDayNumber(dateIso: string): number {
  const parsed = Date.parse(`${dateIso}T00:00:00.000Z`);
  return Math.floor(parsed / DAY_MS);
}

function fromUtcDayNumber(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

function createPipelineError(
  code: string,
  message: string,
  context: Record<string, unknown>,
  cause?: unknown,
): AppError {
  return AppError.create(code, message, 'error', context, cause ? toError(cause) : undefined);
}

function parseRows<T>(
  rows: readonly unknown[],
  schema: z.ZodType<T>,
  rowType: string,
): Result<T[], AppError> {
  const parsedRows: T[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const parsed = schema.safeParse(row);
    if (!parsed.success) {
      return err(
        createPipelineError(
          'PIPELINE_VALIDATION_FAILED',
          'Walidacja danych pipeline nie powiodla sie.',
          { rowType, rowIndex: index, issues: parsed.error.issues },
        ),
      );
    }
    parsedRows.push(parsed.data);
  }

  return ok(parsedRows);
}

function readWarehouseSnapshot(
  db: DatabaseConnection['db'],
  channelId: string,
): Result<WarehouseSnapshot, AppError> {
  try {
    const channelRow = db
      .prepare<{ channelId: string }, ChannelWarehouseRow>(
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
      )
      .get({ channelId });

    if (!channelRow) {
      return err(
        createPipelineError(
          'PIPELINE_CHANNEL_NOT_FOUND',
          'Nie znaleziono kanalu do uruchomienia pipeline.',
          { channelId },
        ),
      );
    }

    const channelParsed = ChannelWarehouseRowSchema.safeParse(channelRow);
    if (!channelParsed.success) {
      return err(
        createPipelineError(
          'PIPELINE_VALIDATION_FAILED',
          'Walidacja danych kanalu nie powiodla sie.',
          { channelId, issues: channelParsed.error.issues },
        ),
      );
    }

    const videoRows = db
      .prepare<{ channelId: string }, VideoWarehouseRow>(
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
      )
      .all({ channelId });

    const channelDayRows = db
      .prepare<{ channelId: string }, ChannelDayWarehouseRow>(
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
      )
      .all({ channelId });

    const videosResult = parseRows(videoRows, VideoWarehouseRowSchema, 'dim_video');
    if (!videosResult.ok) {
      return videosResult;
    }

    const channelDaysResult = parseRows(channelDayRows, ChannelDayWarehouseRowSchema, 'fact_channel_day');
    if (!channelDaysResult.ok) {
      return channelDaysResult;
    }

    if (channelDaysResult.value.length === 0) {
      return err(
        createPipelineError(
          'PIPELINE_NO_CHANNEL_DAYS',
          'Brak danych dziennych kanalu do przetworzenia.',
          { channelId },
        ),
      );
    }

    return ok({
      channel: channelParsed.data,
      videos: videosResult.value,
      channelDays: channelDaysResult.value,
    });
  } catch (cause) {
    return err(
      createPipelineError(
        'PIPELINE_READ_FAILED',
        'Nie udalo sie odczytac danych wejsciowych pipeline.',
        { channelId },
        cause,
      ),
    );
  }
}

function validateSnapshotFreshness(
  snapshot: WarehouseSnapshot,
  now: Date,
  maxFreshnessDays: number,
): Result<ValidatedWarehouseSnapshot, AppError> {
  if (!Number.isFinite(maxFreshnessDays) || maxFreshnessDays < 0) {
    return err(
      createPipelineError(
        'PIPELINE_FRESHNESS_CONFIG_INVALID',
        'Konfiguracja freshness dla pipeline jest niepoprawna.',
        { maxFreshnessDays },
      ),
    );
  }

  const latestDay = snapshot.channelDays[snapshot.channelDays.length - 1];
  if (!latestDay) {
    return err(
      createPipelineError(
        'PIPELINE_NO_CHANNEL_DAYS',
        'Brak danych dziennych kanalu do walidacji freshness.',
        { channelId: snapshot.channel.channelId },
      ),
    );
  }

  const latestDayNumber = toUtcDayNumber(latestDay.date);
  if (Number.isNaN(latestDayNumber)) {
    return err(
      createPipelineError(
        'PIPELINE_DATE_INVALID',
        'Niepoprawna data w danych dziennych kanalu.',
        { date: latestDay.date, channelId: snapshot.channel.channelId },
      ),
    );
  }

  const nowDayNumber = Math.floor(now.getTime() / DAY_MS);
  const ageDays = nowDayNumber - latestDayNumber;
  if (ageDays > maxFreshnessDays) {
    return err(
      createPipelineError(
        'PIPELINE_DATA_STALE',
        'Dane sa zbyt stare do uruchomienia pipeline.',
        {
          channelId: snapshot.channel.channelId,
          latestDate: latestDay.date,
          ageDays,
          maxFreshnessDays,
        },
      ),
    );
  }

  const videoPublishDayNumbers: number[] = [];
  for (const video of snapshot.videos) {
    const publishedDate = video.publishedAt.slice(0, 10);
    const publishedDateValidation = z.iso.date().safeParse(publishedDate);
    if (!publishedDateValidation.success) {
      return err(
        createPipelineError(
          'PIPELINE_VALIDATION_FAILED',
          'Walidacja dat publikacji filmow nie powiodla sie.',
          {
            channelId: snapshot.channel.channelId,
            videoId: video.videoId,
            issues: publishedDateValidation.error.issues,
          },
        ),
      );
    }

    videoPublishDayNumbers.push(toUtcDayNumber(publishedDateValidation.data));
  }

  return ok({
    ...snapshot,
    videoPublishDayNumbers: videoPublishDayNumbers.sort((a, b) => a - b),
  });
}

function generateFeatures(
  snapshot: ValidatedWarehouseSnapshot,
  featureSetVersion: string,
  sourceSyncRunId: number | null,
  generatedAt: string,
): FeatureRow[] {
  const viewsPrefix: number[] = [0];
  const likesPrefix: number[] = [0];
  const commentsPrefix: number[] = [0];

  for (const day of snapshot.channelDays) {
    const previousViews = viewsPrefix[viewsPrefix.length - 1] ?? 0;
    const previousLikes = likesPrefix[likesPrefix.length - 1] ?? 0;
    const previousComments = commentsPrefix[commentsPrefix.length - 1] ?? 0;
    viewsPrefix.push(previousViews + day.views);
    likesPrefix.push(previousLikes + day.likes);
    commentsPrefix.push(previousComments + day.comments);
  }

  const features: FeatureRow[] = [];
  let publishWindowStart = 0;
  let publishWindowEnd = 0;

  for (let index = 0; index < snapshot.channelDays.length; index += 1) {
    const day = snapshot.channelDays[index];
    if (!day) {
      continue;
    }
    const dayNumber = toUtcDayNumber(day.date);

    while (publishWindowEnd < snapshot.videoPublishDayNumbers.length) {
      const publishDay = snapshot.videoPublishDayNumbers[publishWindowEnd];
      if (publishDay === undefined || publishDay > dayNumber) {
        break;
      }
      publishWindowEnd += 1;
    }

    const lowerBound = dayNumber - 29;
    while (publishWindowStart < publishWindowEnd) {
      const publishDay = snapshot.videoPublishDayNumbers[publishWindowStart];
      if (publishDay === undefined || publishDay >= lowerBound) {
        break;
      }
      publishWindowStart += 1;
    }

    const start7d = Math.max(0, index - 6);
    const start30d = Math.max(0, index - 29);

    const viewsCurrent = viewsPrefix[index + 1] ?? 0;
    const views7d = viewsCurrent - (viewsPrefix[start7d] ?? 0);
    const views30d = viewsCurrent - (viewsPrefix[start30d] ?? 0);
    const likesCurrent = likesPrefix[index + 1] ?? 0;
    const likes7d = likesCurrent - (likesPrefix[start7d] ?? 0);
    const commentsCurrent = commentsPrefix[index + 1] ?? 0;
    const comments7d = commentsCurrent - (commentsPrefix[start7d] ?? 0);
    const engagementRate7d = views7d > 0 ? (likes7d + comments7d) / views7d : 0;

    const previousWeekDay = index >= 7 ? snapshot.channelDays[index - 7] : null;
    const subscriberDelta7d = previousWeekDay ? day.subscribers - previousWeekDay.subscribers : 0;

    const videosIn30dWindow = publishWindowEnd - publishWindowStart;
    const publishFrequency30d = videosIn30dWindow / 30;

    const latestPublishedDay = publishWindowEnd > 0
      ? (snapshot.videoPublishDayNumbers[publishWindowEnd - 1] ?? null)
      : null;
    const daysSinceLastVideo = latestPublishedDay === null ? null : dayNumber - latestPublishedDay;

    features.push({
      channelId: snapshot.channel.channelId,
      date: day.date,
      featureSetVersion,
      views7d,
      views30d,
      subscriberDelta7d,
      engagementRate7d,
      publishFrequency30d,
      daysSinceLastVideo,
      sourceSyncRunId,
      generatedAt,
    });
  }

  return features;
}

function resolveFeatureWriteWindow(
  snapshot: ValidatedWarehouseSnapshot,
  input: RunDataPipelineInput,
): Result<FeatureWriteWindow, AppError> {
  const firstDay = snapshot.channelDays[0];
  const lastDay = snapshot.channelDays[snapshot.channelDays.length - 1];
  if (!firstDay || !lastDay) {
    return err(
      createPipelineError(
        'PIPELINE_NO_CHANNEL_DAYS',
        'Brak danych dziennych kanalu do wyznaczenia zakresu feature engineering.',
        { channelId: snapshot.channel.channelId },
      ),
    );
  }

  if (!input.changedDateFrom && !input.changedDateTo) {
    return ok({
      dateFrom: firstDay.date,
      dateTo: lastDay.date,
    });
  }

  if (!input.changedDateFrom || !input.changedDateTo) {
    return err(
      createPipelineError(
        'PIPELINE_INCREMENTAL_RANGE_INVALID',
        'Zakres inkrementalny pipeline wymaga changedDateFrom i changedDateTo.',
        {
          channelId: snapshot.channel.channelId,
          changedDateFrom: input.changedDateFrom ?? null,
          changedDateTo: input.changedDateTo ?? null,
        },
      ),
    );
  }

  const changedFromDay = toUtcDayNumber(input.changedDateFrom);
  const changedToDay = toUtcDayNumber(input.changedDateTo);
  if (Number.isNaN(changedFromDay) || Number.isNaN(changedToDay)) {
    return err(
      createPipelineError(
        'PIPELINE_INCREMENTAL_RANGE_INVALID',
        'Zakres inkrementalny pipeline ma niepoprawny format dat.',
        {
          channelId: snapshot.channel.channelId,
          changedDateFrom: input.changedDateFrom,
          changedDateTo: input.changedDateTo,
        },
      ),
    );
  }

  if (changedFromDay > changedToDay) {
    return err(
      createPipelineError(
        'PIPELINE_INCREMENTAL_RANGE_INVALID',
        'Data poczatkowa zakresu inkrementalnego nie moze byc pozniejsza niz koncowa.',
        {
          channelId: snapshot.channel.channelId,
          changedDateFrom: input.changedDateFrom,
          changedDateTo: input.changedDateTo,
        },
      ),
    );
  }

  const firstDayNumber = toUtcDayNumber(firstDay.date);
  const lastDayNumber = toUtcDayNumber(lastDay.date);
  const rollingBufferDays = 29;
  const writeFromDay = Math.max(firstDayNumber, changedFromDay - rollingBufferDays);
  const writeToDay = lastDayNumber;

  if (writeFromDay > writeToDay) {
    return ok({
      dateFrom: lastDay.date,
      dateTo: lastDay.date,
    });
  }

  return ok({
    dateFrom: fromUtcDayNumber(writeFromDay),
    dateTo: fromUtcDayNumber(writeToDay),
  });
}

function persistPipelineResults(
  db: DatabaseConnection['db'],
  snapshot: ValidatedWarehouseSnapshot,
  features: readonly FeatureRow[],
  featureWriteWindow: FeatureWriteWindow,
  sourceSyncRunId: number | null,
  generatedAt: string,
): Result<void, AppError> {
  try {
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

    const writeTransaction = db.transaction(() => {
      deleteStgVideosStmt.run({ channelId: snapshot.channel.channelId });
      deleteStgChannelStmt.run({ channelId: snapshot.channel.channelId });

      insertStgChannelStmt.run({
        channelId: snapshot.channel.channelId,
        name: snapshot.channel.name,
        description: snapshot.channel.description,
        thumbnailUrl: snapshot.channel.thumbnailUrl,
        publishedAt: snapshot.channel.publishedAt,
        subscriberCount: snapshot.channel.subscriberCount,
        videoCount: snapshot.channel.videoCount,
        viewCount: snapshot.channel.viewCount,
        lastSyncAt: snapshot.channel.lastSyncAt,
        ingestedAt: generatedAt,
      });

      for (const video of snapshot.videos) {
        insertStgVideoStmt.run({
          videoId: video.videoId,
          channelId: video.channelId,
          title: video.title,
          description: video.description,
          publishedAt: video.publishedAt,
          durationSeconds: video.durationSeconds,
          viewCount: video.viewCount,
          likeCount: video.likeCount,
          commentCount: video.commentCount,
          thumbnailUrl: video.thumbnailUrl,
          ingestedAt: generatedAt,
        });
      }

      const firstFeature = features[0];
      if (firstFeature) {
        deleteFeaturesStmt.run({
          channelId: firstFeature.channelId,
          featureSetVersion: firstFeature.featureSetVersion,
          dateFrom: featureWriteWindow.dateFrom,
          dateTo: featureWriteWindow.dateTo,
        });
      }

      for (const feature of features) {
        insertFeatureStmt.run({
          channelId: feature.channelId,
          date: feature.date,
          featureSetVersion: feature.featureSetVersion,
          views7d: feature.views7d,
          views30d: feature.views30d,
          subscriberDelta7d: feature.subscriberDelta7d,
          engagementRate7d: feature.engagementRate7d,
          publishFrequency30d: feature.publishFrequency30d,
          daysSinceLastVideo: feature.daysSinceLastVideo,
          sourceSyncRunId: feature.sourceSyncRunId,
          generatedAt: feature.generatedAt,
        });
      }

      const channelId = snapshot.channel.channelId;
      insertLineageStmt.run({
        pipelineStage: 'ingest',
        entityType: 'channel',
        entityKey: channelId,
        sourceTable: 'dim_channel,dim_video,fact_channel_day',
        sourceRecordCount: 1 + snapshot.videos.length + snapshot.channelDays.length,
        metadataJson: JSON.stringify({
          channelRows: 1,
          videoRows: snapshot.videos.length,
          channelDayRows: snapshot.channelDays.length,
        }),
        sourceSyncRunId,
        producedAt: generatedAt,
      });
      insertLineageStmt.run({
        pipelineStage: 'validation',
        entityType: 'channel',
        entityKey: channelId,
        sourceTable: 'pipeline-validation',
        sourceRecordCount: snapshot.channelDays.length,
        metadataJson: JSON.stringify({
          maxFreshnessDate: snapshot.channelDays[snapshot.channelDays.length - 1]?.date ?? null,
          validatedVideos: snapshot.videos.length,
        }),
        sourceSyncRunId,
        producedAt: generatedAt,
      });
      insertLineageStmt.run({
        pipelineStage: 'staging',
        entityType: 'channel',
        entityKey: channelId,
        sourceTable: 'stg_channels,stg_videos',
        sourceRecordCount: 1 + snapshot.videos.length,
        metadataJson: JSON.stringify({
          stagedChannels: 1,
          stagedVideos: snapshot.videos.length,
        }),
        sourceSyncRunId,
        producedAt: generatedAt,
      });
      insertLineageStmt.run({
        pipelineStage: 'feature-generation',
        entityType: 'channel',
        entityKey: channelId,
        sourceTable: 'ml_features',
        sourceRecordCount: features.length,
        metadataJson: JSON.stringify({
          generatedFeatures: features.length,
          featureSetVersion: firstFeature?.featureSetVersion ?? DEFAULT_FEATURE_SET_VERSION,
          incrementalDateFrom: featureWriteWindow.dateFrom,
          incrementalDateTo: featureWriteWindow.dateTo,
        }),
        sourceSyncRunId,
        producedAt: generatedAt,
      });
    });

    writeTransaction();
    return ok(undefined);
  } catch (cause) {
    return err(
      createPipelineError(
        'PIPELINE_PERSIST_FAILED',
        'Nie udalo sie zapisac wynikow pipeline.',
        { channelId: snapshot.channel.channelId },
        cause,
      ),
    );
  }
}

export function runDataPipeline(input: RunDataPipelineInput): Result<DataPipelineRunResult, AppError> {
  const now = input.now ?? (() => new Date());
  const featureSetVersion = input.featureSetVersion ?? DEFAULT_FEATURE_SET_VERSION;
  const sourceSyncRunId = input.sourceSyncRunId ?? null;
  const maxFreshnessDays = input.maxFreshnessDays ?? DEFAULT_MAX_FRESHNESS_DAYS;

  const snapshotResult = readWarehouseSnapshot(input.db, input.channelId);
  if (!snapshotResult.ok) {
    return snapshotResult;
  }

  const runDate = now();
  const validatedSnapshotResult = validateSnapshotFreshness(
    snapshotResult.value,
    runDate,
    maxFreshnessDays,
  );
  if (!validatedSnapshotResult.ok) {
    return validatedSnapshotResult;
  }

  const generatedAt = runDate.toISOString();
  const allFeatures = generateFeatures(
    validatedSnapshotResult.value,
    featureSetVersion,
    sourceSyncRunId,
    generatedAt,
  );
  const featureWriteWindowResult = resolveFeatureWriteWindow(validatedSnapshotResult.value, input);
  if (!featureWriteWindowResult.ok) {
    return featureWriteWindowResult;
  }
  const features = allFeatures.filter(
    (feature) => feature.date >= featureWriteWindowResult.value.dateFrom
      && feature.date <= featureWriteWindowResult.value.dateTo,
  );

  const persistResult = persistPipelineResults(
    input.db,
    validatedSnapshotResult.value,
    features,
    featureWriteWindowResult.value,
    sourceSyncRunId,
    generatedAt,
  );
  if (!persistResult.ok) {
    return persistResult;
  }

  const latestFeature = features[features.length - 1];
  return ok({
    channelId: input.channelId,
    featureSetVersion,
    sourceSyncRunId,
    stagedChannels: 1,
    stagedVideos: validatedSnapshotResult.value.videos.length,
    generatedFeatures: features.length,
    lineageEntries: 4,
    latestFeatureDate: latestFeature?.date ?? null,
  });
}
