import { fileURLToPath } from 'node:url';
import {
  createChannelQueries,
  createDatabaseConnection,
  createMetricsQueries,
  loadSeedFixtureFromFile,
  runMigrations,
  seedDatabaseFromFixture,
} from '@moze/core';
import { AppError, err, ok, type AppStatusDTO, type ProfileSettingsDTO } from '@moze/shared';
import { describe, expect, it } from 'vitest';
import {
  handleAppGetDataMode,
  handleAppGetStatus,
  handleAppProbeDataMode,
  handleAppSetDataMode,
  handleAuthConnect,
  handleAuthDisconnect,
  handleAuthGetStatus,
  handleImportCsvPreview,
  handleImportCsvRun,
  handleDbGetChannelInfo,
  handleDbGetKpis,
  handleDbGetTimeseries,
  handleMlGetForecast,
  handleMlGetAnomalies,
  handleMlGetTrend,
  handleMlDetectAnomalies,
  handleMlRunBaseline,
  handleProfileCreate,
  handleProfileList,
  handleProfileSetActive,
  handleReportsExport,
  handleReportsGenerate,
  handleAssistantAsk,
  handleAssistantGetThreadMessages,
  handleAssistantListThreads,
  handleSettingsGet,
  handleSettingsUpdate,
  handleSearchContent,
  handleSyncResume,
  handleSyncStart,
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

  const createdAt = '2026-02-12T20:00:00.000Z';
  const updatedAt = '2026-02-12T20:00:00.000Z';
  let profileCounter = 1;
  let activeProfileId = fixtureResult.value.profile.id;
  let profiles: Array<{
    id: string;
    name: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }> = [
    {
      id: activeProfileId,
      name: fixtureResult.value.profile.name,
      isActive: true,
      createdAt,
      updatedAt,
    },
  ];

  let settings: ProfileSettingsDTO = {
    defaultChannelId: fixtureResult.value.channel.channelId,
    preferredForecastMetric: 'views' as const,
    defaultDatePreset: '30d' as const,
    autoRunSync: false,
    autoRunMl: false,
    reportFormats: ['json', 'csv', 'html'] as Array<'json' | 'csv' | 'html'>,
    language: 'pl' as const,
  };

  let authStatus = {
    connected: false,
    provider: null as 'youtube' | null,
    accountLabel: null as string | null,
    connectedAt: null as string | null,
    storage: 'safeStorage' as const,
  };
  let assistantThreadCounter = 0;
  let assistantMessageCounter = 0;
  let assistantThreads: Array<{
    threadId: string;
    channelId: string;
    title: string;
    lastQuestion: string | null;
    updatedAt: string;
    createdAt: string;
  }> = [];
  const assistantMessagesByThread = new Map<string, Array<{
    messageId: number;
    threadId: string;
    role: 'user' | 'assistant';
    text: string;
    confidence: 'low' | 'medium' | 'high' | null;
    followUpQuestions: string[];
    evidence: Array<{
      evidenceId: string;
      tool: 'read_channel_info' | 'read_kpis' | 'read_top_videos' | 'read_anomalies';
      label: string;
      value: string;
      sourceTable: string;
      sourceRecordId: string;
    }>;
    createdAt: string;
  }>>();

  const syncProfileFlags = (nextActiveProfileId: string): void => {
    activeProfileId = nextActiveProfileId;
    profiles = profiles.map((profile) => ({
      ...profile,
      isActive: profile.id === nextActiveProfileId,
      updatedAt: profile.id === nextActiveProfileId ? '2026-02-12T21:00:00.000Z' : profile.updatedAt,
    }));
  };

  const backend: DesktopIpcBackend = {
    getAppStatus: () =>
      ok<AppStatusDTO>({
        version: '0.0.1-test',
        dbReady: true,
        profileId: activeProfileId,
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
    listProfiles: () =>
      ok({
        activeProfileId,
        profiles,
      }),
    createProfile: (input) => {
      profileCounter += 1;
      const newProfileId = `PROFILE-TEST-${String(profileCounter).padStart(3, '0')}`;
      const nowIso = `2026-02-12T2${String(profileCounter % 10)}:00:00.000Z`;
      profiles = [
        ...profiles,
        {
          id: newProfileId,
          name: input.name,
          isActive: false,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ];
      if (input.setActive) {
        syncProfileFlags(newProfileId);
      }

      return ok({
        activeProfileId,
        profiles,
      });
    },
    setActiveProfile: (input) => {
      const foundProfile = profiles.find((profile) => profile.id === input.profileId);
      if (!foundProfile) {
        return err(
          AppError.create(
            'PROFILE_NOT_FOUND',
            'Nie znaleziono profilu o podanym identyfikatorze.',
            'error',
            { profileId: input.profileId },
          ),
        );
      }

      syncProfileFlags(foundProfile.id);
      return ok({
        activeProfileId,
        profiles,
      });
    },
    getProfileSettings: () => ok(settings),
    updateProfileSettings: (input) => {
      settings = {
        ...settings,
        ...input.settings,
      };
      return ok(settings);
    },
    getAuthStatus: () => ok(authStatus),
    connectAuth: (input) => {
      authStatus = {
        connected: true,
        provider: input.provider,
        accountLabel: input.accountLabel,
        connectedAt: '2026-02-12T22:00:00.000Z',
        storage: 'safeStorage',
      };
      return ok(authStatus);
    },
    disconnectAuth: () => {
      authStatus = {
        connected: false,
        provider: null,
        accountLabel: null,
        connectedAt: null,
        storage: 'safeStorage',
      };
      return ok(authStatus);
    },
    previewCsvImport: (input) =>
      ok({
        channelId: input.channelId,
        sourceName: input.sourceName,
        detectedDelimiter: 'comma',
        headers: ['date', 'views', 'subscribers', 'videos', 'title'],
        rowsTotal: 2,
        sampleRows: [
          {
            date: '2026-02-01',
            views: '100',
            subscribers: '10',
            videos: '1',
            title: 'Film A',
          },
        ],
        suggestedMapping: {
          date: 'date',
          views: 'views',
          subscribers: 'subscribers',
          videos: 'videos',
          title: 'title',
        },
      }),
    runCsvImport: (input) =>
      ok({
        importId: 11,
        channelId: input.channelId,
        sourceName: input.sourceName,
        rowsTotal: 3,
        rowsValid: 2,
        rowsInvalid: 1,
        importedDateFrom: '2026-02-01',
        importedDateTo: '2026-02-02',
        pipelineFeatures: 2,
        latestFeatureDate: '2026-02-02',
        validationIssues: [
          {
            rowNumber: 4,
            column: 'views',
            code: 'CSV_IMPORT_INVALID_NUMBER',
            message: 'Wartosc metryki nie jest liczba nieujemna.',
            value: 'abc',
          },
        ],
      }),
    searchContent: (input) =>
      ok({
        channelId: input.channelId,
        query: input.query,
        total: 1,
        items: [
          {
            documentId: 'video:VID-001',
            videoId: 'VID-001',
            title: 'Film testowy',
            publishedAt: '2026-01-01T12:00:00.000Z',
            snippet: '... test ...',
            source: 'title',
            score: -1.2,
          },
        ],
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
    detectMlAnomalies: (input) =>
      ok({
        channelId: input.channelId,
        targetMetric: input.targetMetric,
        analyzedPoints: 60,
        anomaliesDetected: 3,
        changePointsDetected: 1,
        generatedAt: '2026-02-12T22:05:00.000Z',
      }),
    getMlAnomalies: (input) =>
      ok({
        channelId: input.channelId,
        targetMetric: input.targetMetric,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        total: 1,
        items: [
          {
            id: 1,
            channelId: input.channelId,
            targetMetric: input.targetMetric,
            date: '2026-02-10',
            value: 5000,
            baseline: 2500,
            deviationRatio: 1,
            zScore: 4.3,
            method: 'consensus',
            confidence: 'high',
            severity: 'high',
            explanation: 'Wyswietlenia wzrosly o 100% wzgledem sredniej.',
            detectedAt: '2026-02-12T22:05:00.000Z',
          },
        ],
      }),
    getMlTrend: (input) =>
      ok({
        channelId: input.channelId,
        targetMetric: input.targetMetric,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        seasonalityPeriodDays: input.seasonalityPeriodDays,
        summary: {
          trendDirection: 'up',
          trendDelta: 320,
        },
        points: [
          {
            date: input.dateFrom,
            value: 1000,
            trend: 980,
            seasonal: 30,
            residual: -10,
            isChangePoint: false,
          },
          {
            date: input.dateTo,
            value: 1300,
            trend: 1250,
            seasonal: 20,
            residual: 30,
            isChangePoint: true,
          },
        ],
        changePoints: [
          {
            date: input.dateTo,
            direction: 'up',
            magnitude: 220,
            score: 3.5,
          },
        ],
      }),
    generateReport: (input) =>
      ok({
        generatedAt: '2026-02-12T22:30:00.000Z',
        channel: {
          channelId: input.channelId,
          name: 'Kanal testowy',
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
            title: 'Wyswietlenia rosna',
            description: 'Kanal zanotowal dodatnia zmiane wyswietlen.',
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
    askAssistant: (input) => {
      const nowIso = '2026-02-16T00:45:20.000Z';
      const threadId = input.threadId && input.threadId.trim().length > 0
        ? input.threadId
        : `thread-${String(++assistantThreadCounter).padStart(3, '0')}`;
      const existingThread = assistantThreads.find((thread) => thread.threadId === threadId);
      if (!existingThread) {
        assistantThreads = [
          {
            threadId,
            channelId: input.channelId,
            title: input.question,
            lastQuestion: input.question,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          ...assistantThreads,
        ];
      } else {
        assistantThreads = assistantThreads.map((thread) =>
          thread.threadId === threadId
            ? { ...thread, lastQuestion: input.question, updatedAt: nowIso }
            : thread);
      }

      const history = assistantMessagesByThread.get(threadId) ?? [];
      assistantMessageCounter += 1;
      const userMessageId = assistantMessageCounter;
      assistantMessageCounter += 1;
      const assistantMessageId = assistantMessageCounter;
      const assistantMessage = {
        messageId: assistantMessageId,
        threadId,
        role: 'assistant' as const,
        text: 'W analizowanym okresie kanal utrzymal dodatni trend wyswietlen.',
        confidence: 'high' as const,
        followUpQuestions: ['Czy chcesz porownanie z poprzednim okresem?'],
        evidence: [
          {
            evidenceId: `ev-${String(assistantMessageId)}`,
            tool: 'read_kpis' as const,
            label: 'Suma wyswietlen',
            value: '50000',
            sourceTable: 'fact_channel_day',
            sourceRecordId: `channel_id=${input.channelId}`,
          },
        ],
        createdAt: nowIso,
      };

      assistantMessagesByThread.set(threadId, [
        ...history,
        {
          messageId: userMessageId,
          threadId,
          role: 'user',
          text: input.question,
          confidence: null,
          followUpQuestions: [],
          evidence: [],
          createdAt: nowIso,
        },
        assistantMessage,
      ]);

      return ok({
        threadId,
        messageId: assistantMessageId,
        answer: assistantMessage.text,
        confidence: assistantMessage.confidence,
        followUpQuestions: assistantMessage.followUpQuestions,
        evidence: assistantMessage.evidence,
        usedStub: true,
        createdAt: nowIso,
      });
    },
    listAssistantThreads: (input) => {
      const filtered = assistantThreads.filter((thread) => !input.channelId || thread.channelId === input.channelId);
      return ok({
        items: filtered.slice(0, input.limit),
      });
    },
    getAssistantThreadMessages: (input) => {
      const thread = assistantThreads.find((item) => item.threadId === input.threadId);
      if (!thread) {
        return err(
          AppError.create(
            'ASSISTANT_THREAD_NOT_FOUND',
            'Nie znaleziono watku asystenta.',
            'error',
            { threadId: input.threadId },
          ),
        );
      }

      return ok({
        threadId: thread.threadId,
        channelId: thread.channelId,
        title: thread.title,
        messages: assistantMessagesByThread.get(input.threadId) ?? [],
      });
    },
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
  it('returns happy-path results for app/profile/settings/auth/sync/ml/reports/db handlers', async () => {
    const ctx = createTestContext();

    const statusResult = handleAppGetStatus(ctx.backend, undefined);
    expect(statusResult.ok).toBe(true);

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

    const profileListResult = handleProfileList(ctx.backend, undefined);
    expect(profileListResult.ok).toBe(true);
    if (profileListResult.ok) {
      expect(profileListResult.value.profiles.length).toBeGreaterThan(0);
    }

    const profileCreateResult = handleProfileCreate(ctx.backend, {
      name: 'Nowy profil testowy',
      setActive: true,
    });
    expect(profileCreateResult.ok).toBe(true);
    if (profileCreateResult.ok) {
      expect(profileCreateResult.value.activeProfileId).not.toBeNull();
    }

    let switchedProfileId: string | null = null;
    if (profileCreateResult.ok) {
      switchedProfileId = profileCreateResult.value.profiles[0]?.id ?? null;
    }

    if (switchedProfileId) {
      const profileSetActiveResult = handleProfileSetActive(ctx.backend, {
        profileId: switchedProfileId,
      });
      expect(profileSetActiveResult.ok).toBe(true);
    }

    const settingsGetResult = handleSettingsGet(ctx.backend, undefined);
    expect(settingsGetResult.ok).toBe(true);
    if (settingsGetResult.ok) {
      expect(settingsGetResult.value.language).toBe('pl');
    }

    const settingsUpdateResult = handleSettingsUpdate(ctx.backend, {
      settings: {
        defaultDatePreset: '7d',
        autoRunSync: true,
      },
    });
    expect(settingsUpdateResult.ok).toBe(true);
    if (settingsUpdateResult.ok) {
      expect(settingsUpdateResult.value.defaultDatePreset).toBe('7d');
      expect(settingsUpdateResult.value.autoRunSync).toBe(true);
    }

    const authStatusResult = handleAuthGetStatus(ctx.backend, undefined);
    expect(authStatusResult.ok).toBe(true);
    if (authStatusResult.ok) {
      expect(authStatusResult.value.connected).toBe(false);
    }

    const authConnectResult = handleAuthConnect(ctx.backend, {
      provider: 'youtube',
      accountLabel: 'Konto testowe',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(authConnectResult.ok).toBe(true);
    if (authConnectResult.ok) {
      expect(authConnectResult.value.connected).toBe(true);
      expect(authConnectResult.value.provider).toBe('youtube');
    }

    const authDisconnectResult = handleAuthDisconnect(ctx.backend, undefined);
    expect(authDisconnectResult.ok).toBe(true);
    if (authDisconnectResult.ok) {
      expect(authDisconnectResult.value.connected).toBe(false);
    }

    const csvPreviewResult = handleImportCsvPreview(ctx.backend, {
      channelId: ctx.channelId,
      sourceName: 'manual-csv',
      csvText: 'date,views,subscribers,videos,title\n2026-02-01,100,10,1,Film A',
      delimiter: 'auto',
      hasHeader: true,
      previewRowsLimit: 10,
    });
    expect(csvPreviewResult.ok).toBe(true);
    if (csvPreviewResult.ok) {
      expect(csvPreviewResult.value.headers).toContain('date');
    }

    const csvRunResult = await handleImportCsvRun(ctx.backend, {
      channelId: ctx.channelId,
      sourceName: 'manual-csv',
      csvText: 'date,views,subscribers,videos,title\n2026-02-01,100,10,1,Film A',
      delimiter: 'auto',
      hasHeader: true,
      mapping: {
        date: 'date',
        views: 'views',
        subscribers: 'subscribers',
        videos: 'videos',
        title: 'title',
      },
    });
    expect(csvRunResult.ok).toBe(true);
    if (csvRunResult.ok) {
      expect(csvRunResult.value.importId).toBe(11);
      expect(csvRunResult.value.validationIssues.length).toBe(1);
    }

    const searchResult = handleSearchContent(ctx.backend, {
      channelId: ctx.channelId,
      query: 'film',
      limit: 20,
      offset: 0,
    });
    expect(searchResult.ok).toBe(true);
    if (searchResult.ok) {
      expect(searchResult.value.items.length).toBeGreaterThan(0);
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

    const mlDetectResult = await handleMlDetectAnomalies(ctx.backend, {
      channelId: ctx.channelId,
      targetMetric: 'views',
      dateFrom: ctx.dateFrom,
      dateTo: ctx.dateTo,
    });
    expect(mlDetectResult.ok).toBe(true);
    if (mlDetectResult.ok) {
      expect(mlDetectResult.value.anomaliesDetected).toBeGreaterThan(0);
    }

    const mlAnomaliesResult = await handleMlGetAnomalies(ctx.backend, {
      channelId: ctx.channelId,
      targetMetric: 'views',
      dateFrom: ctx.dateFrom,
      dateTo: ctx.dateTo,
      severities: ['high'],
    });
    expect(mlAnomaliesResult.ok).toBe(true);
    if (mlAnomaliesResult.ok) {
      expect(mlAnomaliesResult.value.total).toBeGreaterThan(0);
    }

    const mlTrendResult = await handleMlGetTrend(ctx.backend, {
      channelId: ctx.channelId,
      targetMetric: 'views',
      dateFrom: ctx.dateFrom,
      dateTo: ctx.dateTo,
      seasonalityPeriodDays: 7,
    });
    expect(mlTrendResult.ok).toBe(true);
    if (mlTrendResult.ok) {
      expect(mlTrendResult.value.summary.trendDirection).toBe('up');
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

    const assistantAskResult = await handleAssistantAsk(ctx.backend, {
      channelId: ctx.channelId,
      question: 'Jak szly moje filmy w ostatnim miesiacu?',
      dateFrom: ctx.dateFrom,
      dateTo: ctx.dateTo,
      targetMetric: 'views',
    });
    expect(assistantAskResult.ok).toBe(true);
    if (assistantAskResult.ok) {
      expect(assistantAskResult.value.usedStub).toBe(true);
      expect(assistantAskResult.value.evidence.length).toBeGreaterThan(0);
    }

    const assistantListResult = await handleAssistantListThreads(ctx.backend, {
      channelId: ctx.channelId,
      limit: 20,
    });
    expect(assistantListResult.ok).toBe(true);
    if (assistantListResult.ok) {
      expect(assistantListResult.value.items.length).toBeGreaterThan(0);
    }

    const assistantThreadId = assistantAskResult.ok ? assistantAskResult.value.threadId : null;
    const assistantMessagesResult = await handleAssistantGetThreadMessages(ctx.backend, {
      threadId: assistantThreadId ?? 'thread-001',
    });
    expect(assistantMessagesResult.ok).toBe(true);
    if (assistantMessagesResult.ok) {
      expect(assistantMessagesResult.value.messages.length).toBeGreaterThanOrEqual(2);
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

    const invalidProfileCreate = handleProfileCreate(ctx.backend, {
      setActive: true,
    });
    expect(invalidProfileCreate.ok).toBe(false);
    if (!invalidProfileCreate.ok) {
      expect(invalidProfileCreate.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    const invalidProfileSetActive = handleProfileSetActive(ctx.backend, {
      profileId: '',
    });
    expect(invalidProfileSetActive.ok).toBe(false);
    if (!invalidProfileSetActive.ok) {
      expect(invalidProfileSetActive.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    const invalidSettingsUpdate = handleSettingsUpdate(ctx.backend, {
      settings: { defaultDatePreset: '120d' },
    });
    expect(invalidSettingsUpdate.ok).toBe(false);
    if (!invalidSettingsUpdate.ok) {
      expect(invalidSettingsUpdate.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    const invalidAuthConnect = handleAuthConnect(ctx.backend, {
      provider: 'youtube',
      accountLabel: 'konto',
    });
    expect(invalidAuthConnect.ok).toBe(false);
    if (!invalidAuthConnect.ok) {
      expect(invalidAuthConnect.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    const invalidAuthDisconnectPayload = handleAuthDisconnect(ctx.backend, {
      unexpected: true,
    });
    expect(invalidAuthDisconnectPayload.ok).toBe(false);
    if (!invalidAuthDisconnectPayload.ok) {
      expect(invalidAuthDisconnectPayload.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    const invalidCsvPreview = handleImportCsvPreview(ctx.backend, {
      channelId: ctx.channelId,
      csvText: '',
    });
    expect(invalidCsvPreview.ok).toBe(false);
    if (!invalidCsvPreview.ok) {
      expect(invalidCsvPreview.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    const invalidCsvRun = await handleImportCsvRun(ctx.backend, {
      channelId: ctx.channelId,
      sourceName: 'manual-csv',
      csvText: 'date,views\n2026-01-01,100',
      mapping: {
        date: 'date',
        views: 'views',
      },
    });
    expect(invalidCsvRun.ok).toBe(false);
    if (!invalidCsvRun.ok) {
      expect(invalidCsvRun.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    const invalidSearch = handleSearchContent(ctx.backend, {
      channelId: ctx.channelId,
      query: '',
    });
    expect(invalidSearch.ok).toBe(false);
    if (!invalidSearch.ok) {
      expect(invalidSearch.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    const invalidAssistantAsk = await handleAssistantAsk(ctx.backend, {
      channelId: ctx.channelId,
      question: 'ok',
    });
    expect(invalidAssistantAsk.ok).toBe(false);
    if (!invalidAssistantAsk.ok) {
      expect(invalidAssistantAsk.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    const invalidAssistantList = await handleAssistantListThreads(ctx.backend, {
      channelId: ctx.channelId,
      limit: 0,
    });
    expect(invalidAssistantList.ok).toBe(false);
    if (!invalidAssistantList.ok) {
      expect(invalidAssistantList.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    const invalidAssistantMessages = await handleAssistantGetThreadMessages(ctx.backend, {
      threadId: '',
    });
    expect(invalidAssistantMessages.ok).toBe(false);
    if (!invalidAssistantMessages.ok) {
      expect(invalidAssistantMessages.error.code).toBe('IPC_INVALID_PAYLOAD');
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

    const invalidMlDetect = await handleMlDetectAnomalies(ctx.backend, {
      channelId: '',
      targetMetric: 'views',
      dateFrom: '2026-12-01',
      dateTo: '2026-01-01',
    });
    expect(invalidMlDetect.ok).toBe(false);
    if (!invalidMlDetect.ok) {
      expect(invalidMlDetect.error.code).toBe('IPC_INVALID_PAYLOAD');
    }

    const invalidMlTrend = await handleMlGetTrend(ctx.backend, {
      channelId: ctx.channelId,
      targetMetric: 'views',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      seasonalityPeriodDays: 100,
    });
    expect(invalidMlTrend.ok).toBe(false);
    if (!invalidMlTrend.ok) {
      expect(invalidMlTrend.error.code).toBe('IPC_INVALID_PAYLOAD');
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

  it('returns core/backend error without crash', () => {
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
      listProfiles: () => ctx.backend.listProfiles(),
      createProfile: (input) => ctx.backend.createProfile(input),
      setActiveProfile: (input) => ctx.backend.setActiveProfile(input),
      getProfileSettings: () => ctx.backend.getProfileSettings(),
      updateProfileSettings: (input) => ctx.backend.updateProfileSettings(input),
      getAuthStatus: () => ctx.backend.getAuthStatus(),
      connectAuth: (input) => ctx.backend.connectAuth(input),
      disconnectAuth: () => ctx.backend.disconnectAuth(),
      previewCsvImport: (input) => ctx.backend.previewCsvImport(input),
      runCsvImport: (input) => ctx.backend.runCsvImport(input),
      searchContent: (input) => ctx.backend.searchContent(input),
      startSync: (input) => ctx.backend.startSync(input),
      resumeSync: (input) => ctx.backend.resumeSync(input),
      runMlBaseline: (input) => ctx.backend.runMlBaseline(input),
      getMlForecast: (input) => ctx.backend.getMlForecast(input),
      detectMlAnomalies: (input) => ctx.backend.detectMlAnomalies(input),
      getMlAnomalies: (input) => ctx.backend.getMlAnomalies(input),
      getMlTrend: (input) => ctx.backend.getMlTrend(input),
      generateReport: (input) => ctx.backend.generateReport(input),
      exportReport: (input) => ctx.backend.exportReport(input),
      askAssistant: (input) => ctx.backend.askAssistant(input),
      listAssistantThreads: (input) => ctx.backend.listAssistantThreads(input),
      getAssistantThreadMessages: (input) => ctx.backend.getAssistantThreadMessages(input),
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
