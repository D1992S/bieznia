import { fileURLToPath } from 'node:url';
import { createDatabaseConnection, runMigrations } from '@moze/core';
import { runDataPipeline } from '@moze/data-pipeline';
import { AppError, err, ok } from '@moze/shared';
import { describe, expect, it } from 'vitest';
import type { DataProvider } from './data-provider.ts';
import { createDataModeManager } from './data-mode-manager.ts';
import { createFakeDataProvider } from './fake-provider.ts';
import { createRecordingDataProvider } from './record-provider.ts';
import { createRealDataProvider } from './real-provider.ts';
import { createSyncOrchestrator } from './sync-orchestrator.ts';

const fixturePath = fileURLToPath(new URL('../../../fixtures/seed-data.json', import.meta.url));
const channelId = 'UC-SEED-PL-001';

function createDataModeManagerForTests() {
  const fakeProviderResult = createFakeDataProvider({ fixturePath });
  expect(fakeProviderResult.ok).toBe(true);
  if (!fakeProviderResult.ok) {
    throw new Error(fakeProviderResult.error.message);
  }

  const realProviderResult = createRealDataProvider({ fixturePath });
  expect(realProviderResult.ok).toBe(true);
  if (!realProviderResult.ok) {
    throw new Error(realProviderResult.error.message);
  }

  const recordProvider = createRecordingDataProvider({
    provider: realProviderResult.value,
    outputFilePath: fixturePath,
  });

  return createDataModeManager({
    initialMode: 'fake',
    fakeProvider: fakeProviderResult.value,
    realProvider: realProviderResult.value,
    recordProvider,
    source: 'sync-orchestrator-integration-test',
  });
}

function createMigratedDb() {
  const connectionResult = createDatabaseConnection();
  expect(connectionResult.ok).toBe(true);
  if (!connectionResult.ok) {
    throw new Error(connectionResult.error.message);
  }

  const migrationResult = runMigrations(connectionResult.value.db);
  expect(migrationResult.ok).toBe(true);
  if (!migrationResult.ok) {
    throw new Error(migrationResult.error.message);
  }

  return connectionResult.value;
}

describe('Sync orchestrator integration', () => {
  it('runs sync end-to-end, stores checkpoints and emits sync events', async () => {
    const connection = createMigratedDb();
    const dataModeManager = createDataModeManagerForTests();
    const progressEvents: string[] = [];
    const completeEvents: number[] = [];
    const errorEvents: string[] = [];

    const orchestrator = createSyncOrchestrator({
      db: connection.db,
      dataModeManager,
      hooks: {
        onProgress: (event) => {
          progressEvents.push(event.stage);
        },
        onComplete: (event) => {
          completeEvents.push(event.recordsProcessed);
        },
        onError: (event) => {
          errorEvents.push(event.code);
        },
      },
    });

    const syncResult = await orchestrator.startSync({
      channelId,
      recentLimit: 10,
    });

    expect(syncResult.ok).toBe(true);
    if (!syncResult.ok) {
      connection.close();
      return;
    }

    expect(syncResult.value.status).toBe('completed');
    expect(syncResult.value.pipelineFeatures).not.toBeNull();
    expect(syncResult.value.recordsProcessed).toBeGreaterThan(0);

    const syncRunRow = connection.db
      .prepare<
        { syncRunId: number },
        { status: string; stage: string; finishedAt: string | null; errorCode: string | null }
      >(
        `
          SELECT
            status,
            stage,
            finished_at AS finishedAt,
            error_code AS errorCode
          FROM sync_runs
          WHERE id = @syncRunId
          ORDER BY id ASC
          LIMIT 1
        `,
      )
      .get({ syncRunId: syncResult.value.syncRunId });

    expect(syncRunRow?.status).toBe('completed');
    expect(syncRunRow?.stage).toBe('completed');
    expect(syncRunRow?.finishedAt).not.toBeNull();
    expect(syncRunRow?.errorCode).toBeNull();

    const featureCountRow = connection.db
      .prepare<{ syncRunId: number }, { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM ml_features
          WHERE source_sync_run_id = @syncRunId
          ORDER BY total ASC
          LIMIT 1
        `,
      )
      .get({ syncRunId: syncResult.value.syncRunId });

    const rawCountRow = connection.db
      .prepare<{ syncRunId: number }, { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM raw_api_responses
          WHERE sync_run_id = @syncRunId
          ORDER BY total ASC
          LIMIT 1
        `,
      )
      .get({ syncRunId: syncResult.value.syncRunId });

    expect((featureCountRow?.total ?? 0) > 0).toBe(true);
    expect((rawCountRow?.total ?? 0) >= 3).toBe(true);
    expect(progressEvents).toContain('collect-provider-data');
    expect(progressEvents).toContain('persist-warehouse');
    expect(progressEvents).toContain('run-pipeline');
    expect(progressEvents).toContain('completed');
    expect(completeEvents.length).toBe(1);
    expect(errorEvents.length).toBe(0);

    const closeResult = connection.close();
    expect(closeResult.ok).toBe(true);
  });

  it('persists non-negative daily deltas and accumulates them within the same day', async () => {
    const connection = createMigratedDb();
    let channelViewCount = 80_000;
    let channelSubscriberCount = 4_000;
    let channelVideoCount = 1;
    let videoViewCount = 12_000;
    let videoLikeCount = 640;
    let videoCommentCount = 48;
    const videoId = 'VID-DELTA-001';
    const fixedDate = '2026-02-10';
    let nowIso = `${fixedDate}T08:00:00.000Z`;

    const buildVideoSnapshot = () => ({
      videoId,
      channelId,
      title: 'Delta test',
      description: 'Delta test',
      thumbnailUrl: null,
      publishedAt: '2026-01-01T00:00:00.000Z',
      durationSeconds: 600,
      viewCount: videoViewCount,
      likeCount: videoLikeCount,
      commentCount: videoCommentCount,
    });

    const provider: DataProvider = {
      name: 'delta-test-provider',
      configured: true,
      requiresAuth: false,
      getChannelStats: () =>
        ok({
          channelId,
          name: 'Kanal delta',
          description: 'Opis delta',
          thumbnailUrl: null,
          subscriberCount: channelSubscriberCount,
          videoCount: channelVideoCount,
          viewCount: channelViewCount,
          createdAt: '2020-01-01T00:00:00.000Z',
          lastSyncAt: null,
        }),
      getRecentVideos: () => ok([buildVideoSnapshot()]),
      getVideoStats: () => ok([buildVideoSnapshot()]),
    };

    const dataModeManager = createDataModeManager({
      initialMode: 'fake',
      fakeProvider: provider,
      realProvider: provider,
      recordProvider: createRecordingDataProvider({
        provider,
        outputFilePath: fixturePath,
      }),
      source: 'delta-test',
    });

    const orchestrator = createSyncOrchestrator({
      db: connection.db,
      dataModeManager,
      now: () => new Date(nowIso),
    });

    const firstRun = await orchestrator.startSync({ channelId, recentLimit: 1 });
    expect(firstRun.ok).toBe(true);
    if (!firstRun.ok) {
      const closeResult = connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    const firstChannelDay = connection.db
      .prepare<{ channelId: string; date: string }, { views: number; likes: number; comments: number; subscribers: number }>(
        `
          SELECT
            views,
            likes,
            comments,
            subscribers
          FROM fact_channel_day
          WHERE channel_id = @channelId
            AND date = @date
          ORDER BY date ASC
          LIMIT 1
        `,
      )
      .get({ channelId, date: fixedDate });

    const firstVideoDay = connection.db
      .prepare<{ videoId: string; date: string }, { views: number; likes: number; comments: number }>(
        `
          SELECT
            views,
            likes,
            comments
          FROM fact_video_day
          WHERE video_id = @videoId
            AND date = @date
          ORDER BY date ASC
          LIMIT 1
        `,
      )
      .get({ videoId, date: fixedDate });

    expect(firstChannelDay?.views).toBe(0);
    expect(firstChannelDay?.likes).toBe(0);
    expect(firstChannelDay?.comments).toBe(0);
    expect(firstChannelDay?.subscribers).toBe(channelSubscriberCount);
    expect(firstVideoDay?.views).toBe(0);
    expect(firstVideoDay?.likes).toBe(0);
    expect(firstVideoDay?.comments).toBe(0);

    channelViewCount += 150;
    channelSubscriberCount += 12;
    channelVideoCount += 1;
    videoViewCount += 120;
    videoLikeCount += 11;
    videoCommentCount += 3;
    nowIso = `${fixedDate}T12:00:00.000Z`;

    const secondRun = await orchestrator.startSync({ channelId, recentLimit: 1 });
    expect(secondRun.ok).toBe(true);
    if (!secondRun.ok) {
      const closeResult = connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    channelViewCount += 40;
    videoViewCount += 30;
    videoLikeCount += 2;
    videoCommentCount += 1;
    nowIso = `${fixedDate}T18:00:00.000Z`;

    const thirdRun = await orchestrator.startSync({ channelId, recentLimit: 1 });
    expect(thirdRun.ok).toBe(true);
    if (!thirdRun.ok) {
      const closeResult = connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    const finalChannelDay = connection.db
      .prepare<{ channelId: string; date: string }, { views: number; likes: number; comments: number; subscribers: number; videos: number }>(
        `
          SELECT
            views,
            likes,
            comments,
            subscribers,
            videos
          FROM fact_channel_day
          WHERE channel_id = @channelId
            AND date = @date
          ORDER BY date ASC
          LIMIT 1
        `,
      )
      .get({ channelId, date: fixedDate });

    const finalVideoDay = connection.db
      .prepare<{ videoId: string; date: string }, { views: number; likes: number; comments: number }>(
        `
          SELECT
            views,
            likes,
            comments
          FROM fact_video_day
          WHERE video_id = @videoId
            AND date = @date
          ORDER BY date ASC
          LIMIT 1
        `,
      )
      .get({ videoId, date: fixedDate });

    expect(finalChannelDay?.views).toBe(190);
    expect(finalChannelDay?.likes).toBe(13);
    expect(finalChannelDay?.comments).toBe(4);
    expect(finalChannelDay?.subscribers).toBe(channelSubscriberCount);
    expect(finalChannelDay?.videos).toBe(channelVideoCount);

    expect(finalVideoDay?.views).toBe(150);
    expect(finalVideoDay?.likes).toBe(13);
    expect(finalVideoDay?.comments).toBe(4);

    const closeResult = connection.close();
    expect(closeResult.ok).toBe(true);
  });

  it('skips persist stage when batch marker already exists for resumed run', async () => {
    const connection = createMigratedDb();
    const dataModeManager = createDataModeManagerForTests();

    const orchestrator = createSyncOrchestrator({
      db: connection.db,
      dataModeManager,
    });

    const firstRun = await orchestrator.startSync({
      channelId,
      recentLimit: 5,
    });

    expect(firstRun.ok).toBe(true);
    if (!firstRun.ok) {
      const closeResult = connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    const syncRunId = firstRun.value.syncRunId;
    const rawCountBeforeResume = connection.db
      .prepare<{ syncRunId: number }, { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM raw_api_responses
          WHERE sync_run_id = @syncRunId
          ORDER BY total ASC
          LIMIT 1
        `,
      )
      .get({ syncRunId });

    expect(rawCountBeforeResume?.total ?? 0).toBe(3);

    connection.db
      .prepare<{ syncRunId: number }>(
        `
          UPDATE sync_runs
          SET
            status = 'failed',
            stage = 'persist-warehouse',
            finished_at = datetime('now'),
            error_code = 'TEST_FORCE_RESUME',
            error_message = 'Forced test resume from persist stage.'
          WHERE id = @syncRunId
        `,
      )
      .run({ syncRunId });

    const resumedRun = await orchestrator.resumeSync({
      syncRunId,
      channelId,
      recentLimit: 5,
    });

    expect(resumedRun.ok).toBe(true);
    if (!resumedRun.ok) {
      const closeResult = connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    const rawCountAfterResume = connection.db
      .prepare<{ syncRunId: number }, { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM raw_api_responses
          WHERE sync_run_id = @syncRunId
          ORDER BY total ASC
          LIMIT 1
        `,
      )
      .get({ syncRunId });

    expect(rawCountAfterResume?.total ?? 0).toBe(3);

    const closeResult = connection.close();
    expect(closeResult.ok).toBe(true);
  });

  it('blocks parallel sync runs with in-process mutex', async () => {
    const connection = createMigratedDb();
    let channelAttempts = 0;

    const blockingProvider: DataProvider = {
      name: 'blocking-provider',
      getChannelStats: () => {
        channelAttempts += 1;
        if (channelAttempts === 1) {
          return err(
            AppError.create(
              'SYNC_PROVIDER_TEMPORARY',
              'Provider chwilowo niedostepny.',
              'warning',
              {},
            ),
          );
        }

        return ok({
          channelId,
          name: 'Kanal testowy',
          description: 'Opis testowy',
          thumbnailUrl: null,
          subscriberCount: 1_000,
          videoCount: 2,
          viewCount: 50_000,
          createdAt: '2024-01-01T00:00:00.000Z',
          lastSyncAt: null,
        });
      },
      getRecentVideos: () =>
        ok([
          {
            videoId: 'VID-MUTEX-001',
            channelId,
            title: 'Mutex test',
            description: 'Mutex test',
            thumbnailUrl: null,
            publishedAt: '2025-12-01T00:00:00.000Z',
            durationSeconds: 600,
            viewCount: 10_000,
            likeCount: 400,
            commentCount: 30,
          },
        ]),
      getVideoStats: () =>
        ok([
          {
            videoId: 'VID-MUTEX-001',
            channelId,
            title: 'Mutex test',
            description: 'Mutex test',
            thumbnailUrl: null,
            publishedAt: '2025-12-01T00:00:00.000Z',
            durationSeconds: 600,
            viewCount: 10_000,
            likeCount: 400,
            commentCount: 30,
          },
        ]),
    };

    const dataModeManager = createDataModeManager({
      initialMode: 'fake',
      fakeProvider: blockingProvider,
      realProvider: blockingProvider,
      recordProvider: createRecordingDataProvider({
        provider: blockingProvider,
        outputFilePath: fixturePath,
      }),
      source: 'mutex-test',
    });

    const orchestrator = createSyncOrchestrator({
      db: connection.db,
      dataModeManager,
      retry: {
        maxAttempts: 3,
        initialDelayMs: 50,
        maxDelayMs: 50,
        backoffMultiplier: 1,
      },
    });

    const firstRunPromise = orchestrator.startSync({ channelId, recentLimit: 1 });
    const secondRun = await orchestrator.startSync({ channelId, recentLimit: 1 });

    expect(secondRun.ok).toBe(false);
    if (!secondRun.ok) {
      expect(secondRun.error.code).toBe('SYNC_ALREADY_RUNNING');
    }

    const firstRun = await firstRunPromise;
    expect(firstRun.ok).toBe(true);

    const closeResult = connection.close();
    expect(closeResult.ok).toBe(true);
  });

  it('resumes failed sync run from checkpoint and finishes pipeline', async () => {
    const connection = createMigratedDb();
    const dataModeManager = createDataModeManagerForTests();
    let pipelineCalls = 0;

    const orchestrator = createSyncOrchestrator({
      db: connection.db,
      dataModeManager,
      runPipeline: (pipelineInput) => {
        pipelineCalls += 1;
        if (pipelineCalls === 1) {
          return err(
            AppError.create(
              'PIPELINE_TEMP_FAIL',
              'Pipeline chwilowo niedostepny.',
              'error',
              { channelId: pipelineInput.channelId },
            ),
          );
        }

        return runDataPipeline({
          db: pipelineInput.db,
          channelId: pipelineInput.channelId,
          sourceSyncRunId: pipelineInput.sourceSyncRunId,
          now: pipelineInput.now,
        });
      },
    });

    const failedRun = await orchestrator.startSync({
      channelId,
      recentLimit: 8,
    });
    expect(failedRun.ok).toBe(false);
    if (failedRun.ok) {
      const closeResult = connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }
    expect(failedRun.error.code).toBe('PIPELINE_TEMP_FAIL');

    const failedRow = connection.db
      .prepare<[], { id: number; stage: string | null; status: string }>(
        `
          SELECT
            id,
            stage,
            status
          FROM sync_runs
          ORDER BY id DESC
          LIMIT 1
        `,
      )
      .get();

    expect(failedRow?.status).toBe('failed');
    expect(failedRow?.stage).toBe('run-pipeline');
    expect(failedRow?.id).toBeGreaterThan(0);

    if (!failedRow) {
      const closeResult = connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    const resumedRun = await orchestrator.resumeSync({
      syncRunId: failedRow.id,
      channelId,
      recentLimit: 8,
    });

    expect(resumedRun.ok).toBe(true);
    if (!resumedRun.ok) {
      const closeResult = connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    expect(resumedRun.value.status).toBe('completed');
    expect(resumedRun.value.stage).toBe('completed');
    expect(resumedRun.value.pipelineFeatures).not.toBeNull();

    const resumedRow = connection.db
      .prepare<{ id: number }, { stage: string | null; status: string; errorCode: string | null }>(
        `
          SELECT
            stage,
            status,
            error_code AS errorCode
          FROM sync_runs
          WHERE id = @id
          ORDER BY id ASC
          LIMIT 1
        `,
      )
      .get({ id: resumedRun.value.syncRunId });

    expect(resumedRow?.status).toBe('completed');
    expect(resumedRow?.stage).toBe('completed');
    expect(resumedRow?.errorCode).toBeNull();
    expect(pipelineCalls).toBe(2);

    const closeResult = connection.close();
    expect(closeResult.ok).toBe(true);
  });
});
