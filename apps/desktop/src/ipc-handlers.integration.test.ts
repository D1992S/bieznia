import { fileURLToPath } from 'node:url';
import {
  createChannelQueries,
  createDatabaseConnection,
  createMetricsQueries,
  loadSeedFixtureFromFile,
  runMigrations,
  seedDatabaseFromFixture,
} from '@moze/core';
import { AppError, err, ok, type AppStatusDTO } from '@moze/shared';
import { describe, expect, it } from 'vitest';
import {
  handleAppGetDataMode,
  handleAppProbeDataMode,
  handleMlGetForecast,
  handleMlRunBaseline,
  handleReportsExport,
  handleReportsGenerate,
  handleSyncResume,
  handleSyncStart,
  handleAppSetDataMode,
  handleAppGetStatus,
  handleDbGetChannelInfo,
  handleDbGetKpis,
  handleDbGetTimeseries,
  type DesktopIpcBackend,
} from './ipc-handlers.ts';

const fixturePath = fileURLToPath(new URL('../../../fixtures/seed-data.json', import.meta.url));

interface TestContext {
  backend: DesktopIpcBackend;
  close: () => void;
  channelId: string;
  dateFrom: string;
  dateTo: string;
}

function createTestContext(): TestContext {
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

  const fixtureResult = loadSeedFixtureFromFile(fixturePath);
  expect(fixtureResult.ok).toBe(true);
  if (!fixtureResult.ok) {
    throw new Error(fixtureResult.error.message);
  }

  const seedResult = seedDatabaseFromFixture(connectionResult.value.db, fixtureResult.value);
  expect(seedResult.ok).toBe(true);
  if (!seedResult.ok) {
    throw new Error(seedResult.error.message);
  }

  const metricsQueries = createMetricsQueries(connectionResult.value.db);
  const channelQueries = createChannelQueries(connectionResult.value.db);

  const lastDay = fixtureResult.value.channelDaily[fixtureResult.value.channelDaily.length - 1];
  if (!lastDay) {
    throw new Error('Brak danych fixture.');
  }

  const backend: DesktopIpcBackend = {
    getAppStatus: () =>
      ok<AppStatusDTO>({
        version: '0.0.1-test',
        dbReady: true,
        profileId: fixtureResult.value.profile.id,
        syncRunning: false,
        lastSyncAt: fixtureResult.value.channel.lastSyncAt ?? null,
      }),
    getDataModeStatus: () =>
      ok({
        mode: 'fake',
        availableModes: ['fake', 'real', 'record'],
        source: 'integration-test',
      }),
    setDataMode: (input) =>
      ok({
        mode: input.mode,
        availableModes: ['fake', 'real', 'record'],
        source: 'integration-test',
      }),
    probeDataMode: (input) =>
      ok({
        mode: 'fake',
        providerName: 'fake-data-provider',
        channelId: input.channelId,
        recentVideos: input.recentLimit,
        videoStats: input.videoIds.length,
        recordFilePath: null,
      }),
    startSync: () =>
      ok({
        syncRunId: 1,
        status: 'completed',
        stage: 'completed',
        recordsProcessed: 12,
        pipelineFeatures: 90,
      }),
    resumeSync: (input) =>
      ok({
        syncRunId: input.syncRunId,
        status: 'completed',
        stage: 'completed',
        recordsProcessed: 0,
        pipelineFeatures: 90,
      }),
    runMlBaseline: (input) =>
      ok({
        channelId: input.channelId,
        targetMetric: input.targetMetric,
        status: 'completed',
        reason: null,
        activeModelType: 'holt-winters',
        trainedAt: '2026-02-12T22:00:00.000Z',
        predictionsGenerated: input.horizonDays * 2,
        models: [
          {
            modelId: 1,
            modelType: 'holt-winters',
            status: 'active',
            metrics: { mae: 12, smape: 0.1, mase: 1, sampleSize: 40 },
          },
          {
            modelId: 2,
            modelType: 'linear-regression',
            status: 'shadow',
            metrics: { mae: 15, smape: 0.12, mase: 1.1, sampleSize: 40 },
          },
        ],
      }),
    getMlForecast: (input) =>
      ok({
        channelId: input.channelId,
        targetMetric: input.targetMetric,
        modelType: 'holt-winters',
        trainedAt: '2026-02-12T22:00:00.000Z',
        points: [
          { date: '2026-02-13', horizonDays: 1, predicted: 100, p10: 90, p50: 100, p90: 110 },
          { date: '2026-02-14', horizonDays: 2, predicted: 110, p10: 95, p50: 110, p90: 125 },
        ],
      }),
    generateReport: (input) =>
      ok({
        generatedAt: '2026-02-12T22:30:00.000Z',
        channel: {
          channelId: input.channelId,
          name: 'Kanał testowy',
        },
        range: {
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          days: 30,
        },
        kpis: {
          subscribers: 10000,
          subscribersDelta: 200,
          views: 50000,
          viewsDelta: 4000,
          videos: 120,
          videosDelta: 4,
          avgViewsPerVideo: 416.67,
          engagementRate: 0.05,
        },
        timeseries: {
          metric: input.targetMetric,
          granularity: 'day',
          points: [
            { date: input.dateFrom, value: 1000 },
            { date: input.dateTo, value: 1250 },
          ],
        },
        forecast: {
          channelId: input.channelId,
          targetMetric: input.targetMetric,
          modelType: 'holt-winters',
          trainedAt: '2026-02-12T22:00:00.000Z',
          points: [
            { date: '2026-02-13', horizonDays: 1, predicted: 1300, p10: 1200, p50: 1300, p90: 1400 },
          ],
        },
        topVideos: [
          {
            videoId: 'VID-001',
            title: 'Film testowy',
            publishedAt: '2026-01-01T12:00:00.000Z',
            viewCount: 10000,
            likeCount: 500,
            commentCount: 30,
          },
        ],
        insights: [
          {
            code: 'INSIGHT_VIEWS_POSITIVE',
            title: 'Wyświetlenia rosną',
            description: 'Kanał zanotował dodatnią zmianę wyświetleń.',
            severity: 'good',
          },
        ],
      }),
    exportReport: () =>
      ok({
        generatedAt: '2026-02-12T22:30:00.000Z',
        exportDir: 'C:/tmp/moze-report',
        files: [
          { kind: 'report.json', path: 'C:/tmp/moze-report/report.json', sizeBytes: 100 },
          { kind: 'top_videos.csv', path: 'C:/tmp/moze-report/top_videos.csv', sizeBytes: 120 },
        ],
      }),
    getKpis: (query) => metricsQueries.getKpis(query),
    getTimeseries: (query) => metricsQueries.getTimeseries(query),
    getChannelInfo: (query) => channelQueries.getChannelInfo(query),
  };

  return {
    backend,
    close: () => {
      const closeResult = connectionResult.value.close();
      expect(closeResult.ok).toBe(true);
    },
    channelId: fixtureResult.value.channel.channelId,
    dateFrom: fixtureResult.value.channelDaily[0]?.date ?? lastDay.date,
    dateTo: lastDay.date,
  };
}

describe('Desktop IPC handlers integration', () => {
  it('returns happy-path results for app status, kpis, timeseries and channel info', async () => {
    const ctx = createTestContext();

    const statusResult = handleAppGetStatus(ctx.backend, undefined);
    expect(statusResult.ok).toBe(true);
    if (!statusResult.ok) {
      ctx.close();
      return;
    }

    const modeResult = handleAppGetDataMode(ctx.backend, undefined);
    expect(modeResult.ok).toBe(true);
    if (modeResult.ok) {
      expect(modeResult.value.mode).toBe('fake');
    }

    const setModeResult = handleAppSetDataMode(ctx.backend, { mode: 'record' });
    expect(setModeResult.ok).toBe(true);
    if (setModeResult.ok) {
      expect(setModeResult.value.mode).toBe('record');
    }

    const probeModeResult = handleAppProbeDataMode(ctx.backend, {
      channelId: ctx.channelId,
      videoIds: ['VID-001', 'VID-002'],
      recentLimit: 5,
    });
    expect(probeModeResult.ok).toBe(true);
    if (probeModeResult.ok) {
      expect(probeModeResult.value.videoStats).toBe(2);
    }

    const startSyncResult = await handleSyncStart(ctx.backend, {
      channelId: ctx.channelId,
      profileId: 'PROFILE-001',
      recentLimit: 10,
    });
    expect(startSyncResult.ok).toBe(true);
    if (startSyncResult.ok) {
      expect(startSyncResult.value.status).toBe('completed');
    }

    const resumeSyncResult = await handleSyncResume(ctx.backend, {
      syncRunId: 1,
      channelId: ctx.channelId,
      recentLimit: 10,
    });
    expect(resumeSyncResult.ok).toBe(true);
    if (resumeSyncResult.ok) {
      expect(resumeSyncResult.value.syncRunId).toBe(1);
    }

    const mlRunResult = await handleMlRunBaseline(ctx.backend, {
      channelId: ctx.channelId,
      targetMetric: 'views',
      horizonDays: 7,
    });
    expect(mlRunResult.ok).toBe(true);
    if (mlRunResult.ok) {
      expect(mlRunResult.value.activeModelType).toBe('holt-winters');
    }

    const mlForecastResult = await handleMlGetForecast(ctx.backend, {
      channelId: ctx.channelId,
      targetMetric: 'views',
    });
    expect(mlForecastResult.ok).toBe(true);
    if (mlForecastResult.ok) {
      expect(mlForecastResult.value.points.length).toBeGreaterThan(0);
    }

    const reportGenerateResult = await handleReportsGenerate(ctx.backend, {
      channelId: ctx.channelId,
      dateFrom: ctx.dateFrom,
      dateTo: ctx.dateTo,
      targetMetric: 'views',
    });
    expect(reportGenerateResult.ok).toBe(true);
    if (reportGenerateResult.ok) {
      expect(reportGenerateResult.value.channel.channelId).toBe(ctx.channelId);
    }

    const reportExportResult = await handleReportsExport(ctx.backend, {
      channelId: ctx.channelId,
      dateFrom: ctx.dateFrom,
      dateTo: ctx.dateTo,
      targetMetric: 'views',
      formats: ['json', 'csv'],
    });
    expect(reportExportResult.ok).toBe(true);
    if (reportExportResult.ok) {
      expect(reportExportResult.value.files.length).toBeGreaterThan(0);
    }

    const kpiResult = handleDbGetKpis(ctx.backend, {
      channelId: ctx.channelId,
      dateFrom: ctx.dateFrom,
      dateTo: ctx.dateTo,
    });

    expect(kpiResult.ok).toBe(true);
    if (kpiResult.ok) {
      expect(kpiResult.value.views).toBeGreaterThan(0);
    }

    const timeseriesResult = handleDbGetTimeseries(ctx.backend, {
      channelId: ctx.channelId,
      metric: 'views',
      dateFrom: ctx.dateFrom,
      dateTo: ctx.dateTo,
      granularity: 'day',
    });

    expect(timeseriesResult.ok).toBe(true);
    if (timeseriesResult.ok) {
      expect(timeseriesResult.value.points.length).toBeGreaterThan(0);
    }

    const channelInfoResult = handleDbGetChannelInfo(ctx.backend, { channelId: ctx.channelId });
    expect(channelInfoResult.ok).toBe(true);
    if (channelInfoResult.ok) {
      expect(channelInfoResult.value.channelId).toBe(ctx.channelId);
    }

    ctx.close();
  });

  it('returns AppError for invalid IPC payload', async () => {
    const ctx = createTestContext();

    const invalidPayloadResult = handleDbGetKpis(ctx.backend, {
      channelId: ctx.channelId,
      dateFrom: 'niepoprawna-data',
      dateTo: ctx.dateTo,
    });

    expect(invalidPayloadResult.ok).toBe(false);
    if (!invalidPayloadResult.ok) {
      expect(invalidPayloadResult.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    const invalidStatusPayloadResult = handleAppGetStatus(ctx.backend, {
      unexpected: true,
    });

    expect(invalidStatusPayloadResult.ok).toBe(false);
    if (!invalidStatusPayloadResult.ok) {
      expect(invalidStatusPayloadResult.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    const invalidSetMode = handleAppSetDataMode(ctx.backend, { mode: 'invalid' });
    expect(invalidSetMode.ok).toBe(false);
    if (!invalidSetMode.ok) {
      expect(invalidSetMode.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    const invalidSyncStart = await handleSyncStart(ctx.backend, { recentLimit: 10 });
    expect(invalidSyncStart.ok).toBe(false);
    if (!invalidSyncStart.ok) {
      expect(invalidSyncStart.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    const invalidMlRun = await handleMlRunBaseline(ctx.backend, { channelId: ctx.channelId, horizonDays: 0 });
    expect(invalidMlRun.ok).toBe(false);
    if (!invalidMlRun.ok) {
      expect(invalidMlRun.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    const invalidReportGenerate = await handleReportsGenerate(ctx.backend, {
      channelId: ctx.channelId,
      dateFrom: '2026-01-01',
    });
    expect(invalidReportGenerate.ok).toBe(false);
    if (!invalidReportGenerate.ok) {
      expect(invalidReportGenerate.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    ctx.close();
  });

  it('returns core error without crash when core layer fails', () => {
    const ctx = createTestContext();

    const coreErrorResult = handleDbGetKpis(ctx.backend, {
      channelId: ctx.channelId,
      dateFrom: ctx.dateTo,
      dateTo: ctx.dateFrom,
    });

    expect(coreErrorResult.ok).toBe(false);
    if (!coreErrorResult.ok) {
      expect(coreErrorResult.error.code).toBe('DB_INVALID_DATE_RANGE');
    }

    const failingBackend: DesktopIpcBackend = {
      getAppStatus: () => err(AppError.create('TEST_BACKEND_FAIL', 'Blad testowy backendu.')),
      getDataModeStatus: () => ctx.backend.getDataModeStatus(),
      setDataMode: (input) => ctx.backend.setDataMode(input),
      probeDataMode: (input) => ctx.backend.probeDataMode(input),
      startSync: (input) => ctx.backend.startSync(input),
      resumeSync: (input) => ctx.backend.resumeSync(input),
      runMlBaseline: (input) => ctx.backend.runMlBaseline(input),
      getMlForecast: (input) => ctx.backend.getMlForecast(input),
      generateReport: (input) => ctx.backend.generateReport(input),
      exportReport: (input) => ctx.backend.exportReport(input),
      getKpis: (query) => ctx.backend.getKpis(query),
      getTimeseries: (query) => ctx.backend.getTimeseries(query),
      getChannelInfo: (query) => ctx.backend.getChannelInfo(query),
    };

    const appStatusFailureResult = handleAppGetStatus(failingBackend, undefined);
    expect(appStatusFailureResult.ok).toBe(false);
    if (!appStatusFailureResult.ok) {
      expect(appStatusFailureResult.error.code).toBe('TEST_BACKEND_FAIL');
    }

    ctx.close();
  });
});
