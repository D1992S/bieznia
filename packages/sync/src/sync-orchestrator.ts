import { createCoreRepository, type DatabaseConnection, type SyncRunRecord } from '@moze/core';
import {
  runDataPipeline,
  type DataPipelineRunResult,
  type ProviderChannelSnapshot,
  type ProviderVideoSnapshot,
} from '@moze/data-pipeline';
import {
  AppError,
  createLogger,
  err,
  ok,
  type Logger,
  type Result,
  type SyncCompleteEvent,
  type SyncErrorEvent,
  type SyncProgressEvent,
} from '@moze/shared';
import type { DataProvider } from './data-provider.ts';
import type { DataModeManager } from './data-mode-manager.ts';

type SyncStage = 'collect-provider-data' | 'persist-warehouse' | 'run-pipeline' | 'completed';

const RETRYABLE_PROVIDER_CODES = new Set([
  'SYNC_RATE_LIMIT_EXCEEDED',
  'SYNC_PROVIDER_TEMPORARY',
  'SYNC_PROVIDER_TIMEOUT',
  'SYNC_PROVIDER_UNAVAILABLE',
]);

const NON_RETRYABLE_PROVIDER_CODES = new Set([
  'SYNC_FAKE_DATA_NOT_FOUND',
  'SYNC_REAL_PROVIDER_NOT_CONFIGURED',
]);

export interface SyncRetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

export interface CreateSyncOrchestratorInput {
  db: DatabaseConnection['db'];
  dataModeManager: DataModeManager;
  logger?: Logger;
  now?: () => Date;
  sleep?: (delayMs: number) => Promise<void>;
  retry?: Partial<SyncRetryPolicy>;
  runPipeline?: (input: {
    db: DatabaseConnection['db'];
    channelId: string;
    sourceSyncRunId: number;
    now: () => Date;
  }) => Result<DataPipelineRunResult, AppError>;
  hooks?: {
    onProgress?: (event: SyncProgressEvent) => void;
    onComplete?: (event: SyncCompleteEvent) => void;
    onError?: (event: SyncErrorEvent) => void;
  };
}

export interface StartSyncInput {
  channelId: string;
  profileId?: string | null;
  recentLimit?: number;
}

export interface ResumeSyncInput {
  syncRunId: number;
  channelId: string;
  recentLimit?: number;
}

export interface SyncCommandResultData {
  syncRunId: number;
  status: 'running' | 'completed' | 'failed';
  stage: string;
  recordsProcessed: number;
  pipelineFeatures: number | null;
}

export interface SyncOrchestrator {
  startSync: (input: StartSyncInput) => Promise<Result<SyncCommandResultData, AppError>>;
  resumeSync: (input: ResumeSyncInput) => Promise<Result<SyncCommandResultData, AppError>>;
}

interface CollectedProviderData {
  mode: string;
  providerName: string;
  channel: ProviderChannelSnapshot;
  recentVideos: ProviderVideoSnapshot[];
  videoStats: ProviderVideoSnapshot[];
}

const DEFAULT_RETRY_POLICY: SyncRetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 200,
  backoffMultiplier: 2,
  maxDelayMs: 2_000,
};

function toEventSyncRunId(syncRunId: number): string {
  return String(syncRunId);
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function createSyncError(
  code: string,
  message: string,
  context: Record<string, unknown>,
  cause?: unknown,
): AppError {
  return AppError.create(code, message, 'error', context, cause ? toError(cause) : undefined);
}

function isRetryableProviderError(error: AppError): boolean {
  if (NON_RETRYABLE_PROVIDER_CODES.has(error.code)) {
    return false;
  }
  if (RETRYABLE_PROVIDER_CODES.has(error.code)) {
    return true;
  }
  return error.code.startsWith('SYNC_PROVIDER_');
}

function getBackoffDelayMs(attempt: number, policy: SyncRetryPolicy): number {
  const rawDelay = policy.initialDelayMs * policy.backoffMultiplier ** Math.max(0, attempt - 1);
  return Math.min(policy.maxDelayMs, Math.max(0, Math.round(rawDelay)));
}

function normalizeResumeStage(run: SyncRunRecord): SyncStage {
  if (run.stage === 'run-pipeline') {
    return 'run-pipeline';
  }
  if (run.stage === 'completed' || run.status === 'completed') {
    return 'completed';
  }
  return 'collect-provider-data';
}

function dedupeVideoIds(videos: readonly ProviderVideoSnapshot[]): string[] {
  const ids = new Set<string>();
  for (const video of videos) {
    ids.add(video.videoId);
  }
  return [...ids];
}

function computeNonNegativeDelta(currentValue: number, previousValue: number | null | undefined): number {
  const baseline = previousValue ?? currentValue;
  const delta = currentValue - baseline;
  if (!Number.isFinite(delta) || delta <= 0) {
    return 0;
  }
  return Math.floor(delta);
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function toIsoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function getDurationMs(startedAtIso: string, nowIso: string): number {
  const startedMs = Date.parse(startedAtIso);
  const finishedMs = Date.parse(nowIso);
  if (Number.isNaN(startedMs) || Number.isNaN(finishedMs)) {
    return 0;
  }
  return Math.max(0, finishedMs - startedMs);
}

function parseRecentLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) {
    return 20;
  }
  const normalized = Math.floor(value);
  return Math.min(100, Math.max(1, normalized));
}

export function createSyncOrchestrator(input: CreateSyncOrchestratorInput): SyncOrchestrator {
  const repository = createCoreRepository(input.db);
  const logger = input.logger ?? createLogger({ baseContext: { module: 'sync-orchestrator' } });
  const now = input.now ?? (() => new Date());
  const sleep = input.sleep ?? defaultSleep;
  const retryPolicy: SyncRetryPolicy = {
    ...DEFAULT_RETRY_POLICY,
    ...input.retry,
  };
  const runPipeline =
    input.runPipeline ??
    ((pipelineInput) =>
      runDataPipeline({
        db: pipelineInput.db,
        channelId: pipelineInput.channelId,
        sourceSyncRunId: pipelineInput.sourceSyncRunId,
        now: pipelineInput.now,
      }));

  let activeSyncRunId: number | null = null;

  const emitProgress = (event: SyncProgressEvent): void => {
    input.hooks?.onProgress?.(event);
  };

  const emitComplete = (event: SyncCompleteEvent): void => {
    input.hooks?.onComplete?.(event);
  };

  const emitError = (event: SyncErrorEvent): void => {
    input.hooks?.onError?.(event);
  };

  const finishAsFailed = (
    syncRunId: number,
    startedAtIso: string,
    stage: SyncStage,
    error: AppError,
    recordsProcessed: number,
    pipelineFeatures: number | null,
  ): Result<SyncCommandResultData, AppError> => {
    emitError({
      syncRunId: toEventSyncRunId(syncRunId),
      code: error.code,
      message: error.message,
      retryable: false,
    });

    const finishedAt = now().toISOString();
    const finishResult = repository.finishSyncRun({
      syncRunId,
      status: 'failed',
      stage,
      finishedAt,
      errorCode: error.code,
      errorMessage: error.message,
    });
    if (!finishResult.ok) {
      return err(finishResult.error);
    }

    return err(
      AppError.create(
        error.code,
        error.message,
        'error',
        {
          ...error.context,
          syncRunId,
          stage,
          recordsProcessed,
          pipelineFeatures,
          durationMs: getDurationMs(startedAtIso, finishedAt),
        },
      ),
    );
  };

  const updateCheckpoint = (
    syncRunId: number,
    stage: SyncStage,
    status: 'running' | 'failed' | 'completed' = 'running',
  ): Result<void, AppError> =>
    repository.updateSyncRunCheckpoint({
      syncRunId,
      stage,
      status,
    });

  const runProviderWithRetry = async <T>(
    params: {
      syncRunId: number;
      stage: SyncStage;
      operation: 'getChannelStats' | 'getRecentVideos' | 'getVideoStats';
      call: () => Result<T, AppError>;
    },
  ): Promise<Result<T, AppError>> => {
    for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt += 1) {
      const result = params.call();
      if (result.ok) {
        return result;
      }

      const retryable = isRetryableProviderError(result.error) && attempt < retryPolicy.maxAttempts;
      emitError({
        syncRunId: toEventSyncRunId(params.syncRunId),
        code: result.error.code,
        message: result.error.message,
        retryable,
      });

      if (!retryable) {
        return result;
      }

      const delayMs = getBackoffDelayMs(attempt, retryPolicy);
      emitProgress({
        syncRunId: toEventSyncRunId(params.syncRunId),
        stage: params.stage,
        percent: 25,
        message: `Blad providera (${params.operation}), ponawianie za ${String(delayMs)} ms (proba ${String(
          attempt + 1,
        )}/${String(retryPolicy.maxAttempts)}).`,
      });
      await sleep(delayMs);
    }

    return err(
      createSyncError(
        'SYNC_PROVIDER_RETRY_EXHAUSTED',
        'Wyczerpano wszystkie proby ponowienia zapytania do providera.',
        { operation: params.operation, maxAttempts: retryPolicy.maxAttempts },
      ),
    );
  };

  const collectProviderData = async (
    syncRunId: number,
    channelId: string,
    recentLimit: number,
  ): Promise<Result<CollectedProviderData, AppError>> => {
    const activeProvider = input.dataModeManager.getActiveProvider();
    const provider: DataProvider = activeProvider.provider;

    const channelResult = await runProviderWithRetry({
      syncRunId,
      stage: 'collect-provider-data',
      operation: 'getChannelStats',
      call: () => provider.getChannelStats({ channelId }),
    });
    if (!channelResult.ok) {
      return channelResult;
    }

    const recentVideosResult = await runProviderWithRetry({
      syncRunId,
      stage: 'collect-provider-data',
      operation: 'getRecentVideos',
      call: () => provider.getRecentVideos({ channelId, limit: recentLimit }),
    });
    if (!recentVideosResult.ok) {
      return recentVideosResult;
    }

    const videoIds = dedupeVideoIds(recentVideosResult.value);
    const videoStatsResult =
      videoIds.length === 0
        ? ok<ProviderVideoSnapshot[]>([])
        : await runProviderWithRetry({
            syncRunId,
            stage: 'collect-provider-data',
            operation: 'getVideoStats',
            call: () => provider.getVideoStats({ videoIds }),
          });
    if (!videoStatsResult.ok) {
      return videoStatsResult;
    }

    return ok({
      mode: activeProvider.mode,
      providerName: provider.name,
      channel: channelResult.value,
      recentVideos: recentVideosResult.value,
      videoStats: videoStatsResult.value,
    });
  };

  const persistCollectedData = (
    syncRunId: number,
    profileId: string | null,
    requestedChannelId: string,
    collected: CollectedProviderData,
  ): Result<{ channelId: string; recordsProcessed: number }, AppError> => {
    if (collected.channel.channelId !== requestedChannelId) {
      return err(
        createSyncError(
          'SYNC_CHANNEL_MISMATCH',
          'Provider zwrocil dane innego kanalu niz oczekiwany.',
          {
            requestedChannelId,
            returnedChannelId: collected.channel.channelId,
            provider: collected.providerName,
          },
        ),
      );
    }

    const syncTimestamp = now().toISOString();
    const syncDate = toIsoDate(now());

    const uniqueVideoStatsById = new Map<string, ProviderVideoSnapshot>();
    for (const video of collected.videoStats) {
      uniqueVideoStatsById.set(video.videoId, video);
    }
    const uniqueVideoStats = [...uniqueVideoStatsById.values()];

    const channelSnapshotResult = repository.getChannelSnapshot({
      channelId: collected.channel.channelId,
    });
    if (!channelSnapshotResult.ok) {
      return channelSnapshotResult;
    }

    const previousVideoSnapshotById = new Map<
      string,
      {
        viewCount: number;
        likeCount: number;
        commentCount: number;
      }
    >();
    if (uniqueVideoStats.length > 0) {
      const previousVideoSnapshotsResult = repository.getVideoSnapshots({
        videoIds: dedupeVideoIds(uniqueVideoStats),
      });
      if (!previousVideoSnapshotsResult.ok) {
        return previousVideoSnapshotsResult;
      }

      for (const snapshot of previousVideoSnapshotsResult.value) {
        previousVideoSnapshotById.set(snapshot.videoId, snapshot);
      }
    }
    const videoDayInputs = uniqueVideoStats.map((video) => {
      const previous = previousVideoSnapshotById.get(video.videoId);
      return {
        videoId: video.videoId,
        channelId: video.channelId,
        date: syncDate,
        views: computeNonNegativeDelta(video.viewCount, previous?.viewCount),
        likes: computeNonNegativeDelta(video.likeCount, previous?.likeCount),
        comments: computeNonNegativeDelta(video.commentCount, previous?.commentCount),
        watchTimeMinutes: null,
        impressions: null,
        ctr: null,
        updatedAt: syncTimestamp,
      };
    });

    const likeDeltaSum = videoDayInputs.reduce((total, video) => total + video.likes, 0);
    const commentDeltaSum = videoDayInputs.reduce((total, video) => total + video.comments, 0);
    const channelViewsDelta = computeNonNegativeDelta(
      collected.channel.viewCount,
      channelSnapshotResult.value?.viewCount,
    );

    const upsertChannelResult = repository.upsertChannel({
      channelId: collected.channel.channelId,
      profileId,
      name: collected.channel.name,
      description: collected.channel.description,
      thumbnailUrl: collected.channel.thumbnailUrl,
      publishedAt: collected.channel.createdAt,
      subscriberCount: collected.channel.subscriberCount,
      videoCount: collected.channel.videoCount,
      viewCount: collected.channel.viewCount,
      lastSyncAt: syncTimestamp,
      updatedAt: syncTimestamp,
    });
    if (!upsertChannelResult.ok) {
      return upsertChannelResult;
    }

    const upsertVideosResult = repository.upsertVideos(
      uniqueVideoStats.map((video) => ({
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
        updatedAt: syncTimestamp,
      })),
    );
    if (!upsertVideosResult.ok) {
      return upsertVideosResult;
    }

    const upsertChannelDayResult = repository.upsertChannelDays([
      {
        channelId: collected.channel.channelId,
        date: syncDate,
        subscribers: collected.channel.subscriberCount,
        views: channelViewsDelta,
        videos: collected.channel.videoCount,
        likes: likeDeltaSum,
        comments: commentDeltaSum,
        watchTimeMinutes: null,
        updatedAt: syncTimestamp,
      },
    ]);
    if (!upsertChannelDayResult.ok) {
      return upsertChannelDayResult;
    }

    const upsertVideoDayResult = repository.upsertVideoDays(videoDayInputs);
    if (!upsertVideoDayResult.ok) {
      return upsertVideoDayResult;
    }

    const rawEntries: Array<{
      endpoint: string;
      requestParamsJson: string;
      responseBodyJson: string;
    }> = [
      {
        endpoint: 'getChannelStats',
        requestParamsJson: JSON.stringify({ channelId: requestedChannelId }),
        responseBodyJson: JSON.stringify(collected.channel),
      },
      {
        endpoint: 'getRecentVideos',
        requestParamsJson: JSON.stringify({
          channelId: requestedChannelId,
          limit: collected.recentVideos.length,
        }),
        responseBodyJson: JSON.stringify(collected.recentVideos),
      },
      {
        endpoint: 'getVideoStats',
        requestParamsJson: JSON.stringify({
          videoIds: dedupeVideoIds(uniqueVideoStats),
        }),
        responseBodyJson: JSON.stringify(uniqueVideoStats),
      },
    ];

    for (const entry of rawEntries) {
      const rawResult = repository.recordRawApiResponse({
        source: `sync:${collected.mode}:${collected.providerName}`,
        endpoint: entry.endpoint,
        requestParamsJson: entry.requestParamsJson,
        responseBodyJson: entry.responseBodyJson,
        httpStatus: 200,
        fetchedAt: syncTimestamp,
        syncRunId,
      });
      if (!rawResult.ok) {
        return rawResult;
      }
    }

    return ok({
      channelId: collected.channel.channelId,
      recordsProcessed: 2 + uniqueVideoStats.length * 2,
    });
  };

  const executeSyncRun = async (params: {
    syncRunId: number;
    startedAtIso: string;
    channelId: string;
    profileId: string | null;
    recentLimit: number;
    startFromStage: SyncStage;
  }): Promise<Result<SyncCommandResultData, AppError>> => {
    let targetChannelId = params.channelId;
    let currentStage: SyncStage = params.startFromStage;
    let recordsProcessed = 0;
    let pipelineFeatures: number | null = null;

    if (params.startFromStage !== 'run-pipeline') {
      currentStage = 'collect-provider-data';
      const checkpointResult = updateCheckpoint(params.syncRunId, currentStage, 'running');
      if (!checkpointResult.ok) {
        return finishAsFailed(
          params.syncRunId,
          params.startedAtIso,
          currentStage,
          checkpointResult.error,
          recordsProcessed,
          pipelineFeatures,
        );
      }

      emitProgress({
        syncRunId: toEventSyncRunId(params.syncRunId),
        stage: currentStage,
        percent: 10,
        message: 'Pobieranie danych z providera...',
      });

      const collectedResult = await collectProviderData(
        params.syncRunId,
        params.channelId,
        params.recentLimit,
      );
      if (!collectedResult.ok) {
        return finishAsFailed(
          params.syncRunId,
          params.startedAtIso,
          currentStage,
          collectedResult.error,
          recordsProcessed,
          pipelineFeatures,
        );
      }

      currentStage = 'persist-warehouse';
      const persistCheckpointResult = updateCheckpoint(params.syncRunId, currentStage, 'running');
      if (!persistCheckpointResult.ok) {
        return finishAsFailed(
          params.syncRunId,
          params.startedAtIso,
          currentStage,
          persistCheckpointResult.error,
          recordsProcessed,
          pipelineFeatures,
        );
      }

      emitProgress({
        syncRunId: toEventSyncRunId(params.syncRunId),
        stage: currentStage,
        percent: 55,
        message: 'Zapisywanie danych synchronizacji do bazy...',
      });

      const persistResult = persistCollectedData(
        params.syncRunId,
        params.profileId,
        targetChannelId,
        collectedResult.value,
      );
      if (!persistResult.ok) {
        return finishAsFailed(
          params.syncRunId,
          params.startedAtIso,
          currentStage,
          persistResult.error,
          recordsProcessed,
          pipelineFeatures,
        );
      }

      targetChannelId = persistResult.value.channelId;
      recordsProcessed = persistResult.value.recordsProcessed;
    }

    currentStage = 'run-pipeline';
    const pipelineCheckpointResult = updateCheckpoint(params.syncRunId, currentStage, 'running');
    if (!pipelineCheckpointResult.ok) {
      return finishAsFailed(
        params.syncRunId,
        params.startedAtIso,
        currentStage,
        pipelineCheckpointResult.error,
        recordsProcessed,
        pipelineFeatures,
      );
    }

    emitProgress({
      syncRunId: toEventSyncRunId(params.syncRunId),
      stage: currentStage,
      percent: 85,
      message: 'Uruchamianie pipeline danych...',
    });

    const pipelineResult = runPipeline({
      db: input.db,
      channelId: targetChannelId,
      sourceSyncRunId: params.syncRunId,
      now,
    });
    if (!pipelineResult.ok) {
      return finishAsFailed(
        params.syncRunId,
        params.startedAtIso,
        currentStage,
        pipelineResult.error,
        recordsProcessed,
        pipelineFeatures,
      );
    }

    pipelineFeatures = pipelineResult.value.generatedFeatures;
    currentStage = 'completed';
    const finishedAt = now().toISOString();
    const finishRunResult = repository.finishSyncRun({
      syncRunId: params.syncRunId,
      status: 'completed',
      stage: currentStage,
      finishedAt,
      errorCode: null,
      errorMessage: null,
    });
    if (!finishRunResult.ok) {
      return err(finishRunResult.error);
    }

    emitProgress({
      syncRunId: toEventSyncRunId(params.syncRunId),
      stage: currentStage,
      percent: 100,
      message: 'Synchronizacja zakonczona.',
    });

    emitComplete({
      syncRunId: toEventSyncRunId(params.syncRunId),
      duration: getDurationMs(params.startedAtIso, finishedAt),
      recordsProcessed,
    });

    return ok({
      syncRunId: params.syncRunId,
      status: 'completed',
      stage: currentStage,
      recordsProcessed,
      pipelineFeatures,
    });
  };

  const acquireMutex = (syncRunId?: number): Result<void, AppError> => {
    if (activeSyncRunId !== null) {
      return err(
        createSyncError(
          'SYNC_ALREADY_RUNNING',
          'Synchronizacja jest juz w trakcie. Poczekaj na zakonczenie.',
          { activeSyncRunId, requestedSyncRunId: syncRunId ?? null },
        ),
      );
    }
    return ok(undefined);
  };

  return {
    startSync: async (startInput) => {
      if (!startInput.channelId) {
        return err(createSyncError('SYNC_INVALID_INPUT', 'Brak channelId dla synchronizacji.', {}));
      }

      const mutexResult = acquireMutex();
      if (!mutexResult.ok) {
        return mutexResult;
      }

      const activeRunResult = repository.getLatestOpenSyncRun({ profileId: null });
      if (!activeRunResult.ok) {
        return activeRunResult;
      }
      if (activeRunResult.value) {
        return err(
          createSyncError(
            'SYNC_ALREADY_RUNNING',
            'Wykryto aktywna synchronizacje. Uzyj wznowienia zamiast nowego startu.',
            { activeSyncRunId: activeRunResult.value.id },
          ),
        );
      }

      const startedAt = now().toISOString();
      const createRunResult = repository.createSyncRun({
        profileId: startInput.profileId ?? null,
        status: 'running',
        stage: 'collect-provider-data',
        startedAt,
      });
      if (!createRunResult.ok) {
        return createRunResult;
      }

      const syncRunId = createRunResult.value;
      activeSyncRunId = syncRunId;
      logger.info('Rozpoczeto synchronizacje.', {
        syncRunId,
        channelId: startInput.channelId,
        profileId: startInput.profileId ?? null,
      });

      try {
        return await executeSyncRun({
          syncRunId,
          startedAtIso: startedAt,
          channelId: startInput.channelId,
          profileId: startInput.profileId ?? null,
          recentLimit: parseRecentLimit(startInput.recentLimit),
          startFromStage: 'collect-provider-data',
        });
      } finally {
        activeSyncRunId = null;
      }
    },

    resumeSync: async (resumeInput) => {
      if (!resumeInput.channelId) {
        return err(createSyncError('SYNC_INVALID_INPUT', 'Brak channelId dla wznowienia sync.', {}));
      }

      const mutexResult = acquireMutex(resumeInput.syncRunId);
      if (!mutexResult.ok) {
        return mutexResult;
      }

      const runResult = repository.getSyncRunById({ syncRunId: resumeInput.syncRunId });
      if (!runResult.ok) {
        return runResult;
      }

      if (!runResult.value) {
        return err(
          createSyncError(
            'SYNC_RUN_NOT_FOUND',
            'Nie znaleziono rekordu synchronizacji do wznowienia.',
            { syncRunId: resumeInput.syncRunId },
          ),
        );
      }

      const startFromStage = normalizeResumeStage(runResult.value);
      if (startFromStage === 'completed') {
        return err(
          createSyncError(
            'SYNC_RUN_ALREADY_COMPLETED',
            'Ten sync run jest juz zakonczony i nie wymaga wznowienia.',
            { syncRunId: resumeInput.syncRunId },
          ),
        );
      }

      const openRunResult = repository.getLatestOpenSyncRun({ profileId: null });
      if (!openRunResult.ok) {
        return openRunResult;
      }
      if (openRunResult.value && openRunResult.value.id !== resumeInput.syncRunId) {
        return err(
          createSyncError(
            'SYNC_ALREADY_RUNNING',
            'Istnieje inny aktywny sync run. Zamknij go przed wznowieniem.',
            {
              activeSyncRunId: openRunResult.value.id,
              requestedSyncRunId: resumeInput.syncRunId,
            },
          ),
        );
      }

      const resumeResult = repository.resumeSyncRun({
        syncRunId: resumeInput.syncRunId,
        status: 'running',
        stage: startFromStage,
      });
      if (!resumeResult.ok) {
        return resumeResult;
      }

      activeSyncRunId = resumeInput.syncRunId;
      logger.info('Wznawianie synchronizacji.', {
        syncRunId: resumeInput.syncRunId,
        stage: startFromStage,
        channelId: resumeInput.channelId,
      });

      try {
        return await executeSyncRun({
          syncRunId: resumeInput.syncRunId,
          startedAtIso: runResult.value.startedAt,
          channelId: resumeInput.channelId,
          profileId: runResult.value.profileId,
          recentLimit: parseRecentLimit(resumeInput.recentLimit),
          startFromStage,
        });
      } finally {
        activeSyncRunId = null;
      }
    },
  };
}
