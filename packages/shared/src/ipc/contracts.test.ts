import { describe, it, expect } from 'vitest';
import {
  AppStatusDTOSchema,
  DataModeProbeInputDTOSchema,
  DataModeProbeResultDTOSchema,
  DataModeSchema,
  DataModeStatusDTOSchema,
  MlForecastQueryInputDTOSchema,
  MlForecastResultDTOSchema,
  MlDetectAnomaliesInputDTOSchema,
  MlDetectAnomaliesResultDTOSchema,
  MlAnomalyQueryInputDTOSchema,
  MlAnomalyListResultDTOSchema,
  MlTrendQueryInputDTOSchema,
  MlTrendResultDTOSchema,
  MlRunBaselineInputDTOSchema,
  MlRunBaselineResultDTOSchema,
  AuthConnectInputDTOSchema,
  AuthStatusDTOSchema,
  ProfileCreateInputDTOSchema,
  ProfileListResultDTOSchema,
  ProfileSettingsDTOSchema,
  ProfileSetActiveInputDTOSchema,
  ReportExportInputDTOSchema,
  ReportExportResultDTOSchema,
  ReportGenerateInputDTOSchema,
  ReportGenerateResultDTOSchema,
  CsvImportPreviewInputDTOSchema,
  CsvImportPreviewResultDTOSchema,
  CsvImportRunInputDTOSchema,
  CsvImportRunResultDTOSchema,
  SearchContentInputDTOSchema,
  SearchContentResultDTOSchema,
  MlTargetMetricSchema,
  SyncCommandResultDTOSchema,
  SyncResumeInputDTOSchema,
  SyncStartInputDTOSchema,
  SetDataModeInputDTOSchema,
  KpiQueryDTOSchema,
  KpiResultDTOSchema,
  TimeseriesQueryDTOSchema,
  TimeseriesResultDTOSchema,
  ChannelInfoDTOSchema,
  IPC_CHANNELS,
  IPC_EVENTS,
} from './contracts.ts';

describe('IPC Contracts', () => {
  describe('AppStatusDTO', () => {
    it('validates correct data', () => {
      const data = {
        version: '0.0.1',
        dbReady: true,
        profileId: null,
        syncRunning: false,
        lastSyncAt: null,
      };
      expect(AppStatusDTOSchema.parse(data)).toEqual(data);
    });

    it('rejects invalid data', () => {
      expect(() => AppStatusDTOSchema.parse({ version: 123 })).toThrow();
    });
  });

  describe('KpiQueryDTO', () => {
    it('validates date range', () => {
      const data = {
        channelId: 'UC123',
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
      };
      expect(KpiQueryDTOSchema.parse(data)).toEqual(data);
    });
  });

  describe('KpiResultDTO', () => {
    it('validates KPI result', () => {
      const data = {
        subscribers: 10000,
        subscribersDelta: 500,
        views: 50000,
        viewsDelta: 5000,
        videos: 100,
        videosDelta: 5,
        avgViewsPerVideo: 500,
        engagementRate: 0.05,
      };
      expect(KpiResultDTOSchema.parse(data)).toEqual(data);
    });
  });

  describe('TimeseriesQueryDTO', () => {
    it('applies default granularity', () => {
      const data = {
        channelId: 'UC123',
        metric: 'views' as const,
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
      };
      const parsed = TimeseriesQueryDTOSchema.parse(data);
      expect(parsed.granularity).toBe('day');
    });

    it('accepts explicit granularity', () => {
      const data = {
        channelId: 'UC123',
        metric: 'subscribers' as const,
        dateFrom: '2025-01-01',
        dateTo: '2025-03-01',
        granularity: 'week' as const,
      };
      expect(TimeseriesQueryDTOSchema.parse(data).granularity).toBe('week');
    });

    it('rejects invalid metric', () => {
      const data = {
        channelId: 'UC123',
        metric: 'invalid',
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
      };
      expect(() => TimeseriesQueryDTOSchema.parse(data)).toThrow();
    });
  });

  describe('TimeseriesResultDTO', () => {
    it('validates result with prediction data', () => {
      const data = {
        metric: 'views',
        granularity: 'day',
        points: [
          { date: '2025-01-01', value: 100, predicted: null },
          { date: '2025-01-02', value: 120, predicted: 115, confidenceLow: 100, confidenceHigh: 130 },
        ],
      };
      expect(TimeseriesResultDTOSchema.parse(data)).toEqual(data);
    });
  });

  describe('ChannelInfoDTO', () => {
    it('validates channel data', () => {
      const data = {
        channelId: 'UC123',
        name: 'Test Channel',
        description: 'A test channel',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        subscriberCount: 10000,
        videoCount: 100,
        viewCount: 500000,
        createdAt: '2020-01-01T00:00:00Z',
        lastSyncAt: null,
      };
      expect(ChannelInfoDTOSchema.parse(data)).toEqual(data);
    });
  });

  describe('DataModeDTO', () => {
    it('validates data mode status', () => {
      const data = {
        mode: 'fake' as const,
        availableModes: ['fake', 'real', 'record'] as const,
        source: 'desktop-runtime',
      };
      expect(DataModeStatusDTOSchema.parse(data)).toEqual(data);
    });

    it('validates set mode input', () => {
      const data = { mode: 'real' as const };
      expect(SetDataModeInputDTOSchema.parse(data)).toEqual(data);
    });

    it('applies defaults for probe input', () => {
      const parsed = DataModeProbeInputDTOSchema.parse({ channelId: 'UC123' });
      expect(parsed.videoIds).toEqual(['VID-001']);
      expect(parsed.recentLimit).toBe(5);
    });

    it('validates probe output', () => {
      const data = {
        mode: 'record' as const,
        providerName: 'real-youtube-provider',
        channelId: 'UC123',
        recentVideos: 5,
        videoStats: 2,
        recordFilePath: 'fixtures/recordings/latest-provider-recording.json',
      };
      expect(DataModeProbeResultDTOSchema.parse(data)).toEqual(data);
    });

    it('rejects invalid data mode', () => {
      expect(() => DataModeSchema.parse('invalid')).toThrow();
    });
  });

  describe('Sync DTO', () => {
    it('applies default recentLimit for sync start input', () => {
      const parsed = SyncStartInputDTOSchema.parse({
        channelId: 'UC123',
      });

      expect(parsed.recentLimit).toBe(20);
      expect(parsed.profileId).toBeUndefined();
    });

    it('validates sync resume input', () => {
      const parsed = SyncResumeInputDTOSchema.parse({
        syncRunId: 12,
        channelId: 'UC123',
      });
      expect(parsed.syncRunId).toBe(12);
      expect(parsed.channelId).toBe('UC123');
      expect(parsed.recentLimit).toBe(20);
    });

    it('validates sync command result payload', () => {
      const parsed = SyncCommandResultDTOSchema.parse({
        syncRunId: 9,
        status: 'completed',
        stage: 'completed',
        recordsProcessed: 55,
        pipelineFeatures: 90,
      });

      expect(parsed.status).toBe('completed');
    });
  });

  describe('ML DTO', () => {
    it('applies defaults for ml run baseline input', () => {
      const parsed = MlRunBaselineInputDTOSchema.parse({
        channelId: 'UC123',
      });

      expect(parsed.targetMetric).toBe('views');
      expect(parsed.horizonDays).toBe(7);
    });

    it('validates ml run baseline result payload', () => {
      const parsed = MlRunBaselineResultDTOSchema.parse({
        channelId: 'UC123',
        targetMetric: 'views',
        status: 'completed',
        reason: null,
        activeModelType: 'holt-winters',
        trainedAt: '2026-02-12T22:00:00.000Z',
        predictionsGenerated: 7,
        models: [
          {
            modelId: 1,
            modelType: 'holt-winters',
            status: 'active',
            metrics: {
              mae: 12,
              smape: 0.08,
              mase: 0.95,
              sampleSize: 45,
            },
          },
        ],
      });

      expect(parsed.models[0]?.status).toBe('active');
    });

    it('validates ml forecast query and result', () => {
      const query = MlForecastQueryInputDTOSchema.parse({
        channelId: 'UC123',
      });
      expect(query.targetMetric).toBe('views');

      const result = MlForecastResultDTOSchema.parse({
        channelId: 'UC123',
        targetMetric: 'views',
        modelType: 'linear-regression',
        trainedAt: '2026-02-12T22:00:00.000Z',
        points: [
          {
            date: '2026-02-13',
            horizonDays: 1,
            predicted: 100,
            p10: 90,
            p50: 100,
            p90: 110,
          },
        ],
      });

      expect(result.points).toHaveLength(1);
    });

    it('validates anomaly detection payloads', () => {
      const detectInput = MlDetectAnomaliesInputDTOSchema.parse({
        channelId: 'UC123',
      });
      expect(detectInput.targetMetric).toBe('views');

      const detectResult = MlDetectAnomaliesResultDTOSchema.parse({
        channelId: 'UC123',
        targetMetric: 'views',
        analyzedPoints: 90,
        anomaliesDetected: 4,
        changePointsDetected: 2,
        generatedAt: '2026-02-15T10:00:00.000Z',
      });
      expect(detectResult.anomaliesDetected).toBe(4);

      const anomaliesQuery = MlAnomalyQueryInputDTOSchema.parse({
        channelId: 'UC123',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
        severities: ['high', 'critical'],
      });
      expect(anomaliesQuery.severities).toHaveLength(2);

      const anomaliesResult = MlAnomalyListResultDTOSchema.parse({
        channelId: 'UC123',
        targetMetric: 'views',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
        total: 1,
        items: [
          {
            id: 1,
            channelId: 'UC123',
            targetMetric: 'views',
            date: '2026-01-11',
            value: 9500,
            baseline: 3200,
            deviationRatio: 1.96,
            zScore: 4.2,
            method: 'consensus',
            confidence: 'high',
            severity: 'critical',
            explanation: 'Wyswietlenia wzrosly znaczaco wzgledem bazowej sredniej.',
            detectedAt: '2026-02-15T10:00:00.000Z',
          },
        ],
      });
      expect(anomaliesResult.items[0]?.method).toBe('consensus');
    });

    it('validates trend query and result payloads', () => {
      const trendQuery = MlTrendQueryInputDTOSchema.parse({
        channelId: 'UC123',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      });
      expect(trendQuery.seasonalityPeriodDays).toBe(7);

      const trendResult = MlTrendResultDTOSchema.parse({
        channelId: 'UC123',
        targetMetric: 'views',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
        seasonalityPeriodDays: 7,
        summary: {
          trendDirection: 'up',
          trendDelta: 420,
        },
        points: [
          {
            date: '2026-01-01',
            value: 1200,
            trend: 1180,
            seasonal: 30,
            residual: -10,
            isChangePoint: false,
          },
          {
            date: '2026-01-16',
            value: 2100,
            trend: 1750,
            seasonal: 200,
            residual: 150,
            isChangePoint: true,
          },
        ],
        changePoints: [
          {
            date: '2026-01-16',
            direction: 'up',
            magnitude: 620,
            score: 4.7,
          },
        ],
      });
      expect(trendResult.changePoints[0]?.direction).toBe('up');
    });

    it('rejects invalid target metric', () => {
      expect(() => MlTargetMetricSchema.parse('likes')).toThrow();
    });
  });

  describe('Reports DTO', () => {
    it('applies defaults for report generate input', () => {
      const parsed = ReportGenerateInputDTOSchema.parse({
        channelId: 'UC123',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      });

      expect(parsed.targetMetric).toBe('views');
    });

    it('applies defaults for report export input', () => {
      const parsed = ReportExportInputDTOSchema.parse({
        channelId: 'UC123',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      });

      expect(parsed.targetMetric).toBe('views');
      expect(parsed.formats).toEqual(['json', 'csv']);
    });

    it('validates report generate and export results', () => {
      const generated = ReportGenerateResultDTOSchema.parse({
        generatedAt: '2026-02-12T23:00:00.000Z',
        channel: {
          channelId: 'UC123',
          name: 'Kanał testowy',
        },
        range: {
          dateFrom: '2026-01-01',
          dateTo: '2026-01-31',
          days: 31,
        },
        kpis: {
          subscribers: 10000,
          subscribersDelta: 250,
          views: 500000,
          viewsDelta: 40000,
          videos: 100,
          videosDelta: 4,
          avgViewsPerVideo: 5000,
          engagementRate: 0.06,
        },
        timeseries: {
          metric: 'views',
          granularity: 'day',
          points: [
            { date: '2026-01-01', value: 12345 },
          ],
        },
        forecast: {
          channelId: 'UC123',
          targetMetric: 'views',
          modelType: 'holt-winters',
          trainedAt: '2026-02-12T22:00:00.000Z',
          points: [
            {
              date: '2026-02-13',
              horizonDays: 1,
              predicted: 14000,
              p10: 12000,
              p50: 14000,
              p90: 16000,
            },
          ],
        },
        topVideos: [
          {
            videoId: 'VID-001',
            title: 'Top film',
            publishedAt: '2025-12-01T12:00:00.000Z',
            viewCount: 123456,
            likeCount: 7000,
            commentCount: 800,
          },
        ],
        insights: [
          {
            code: 'INSIGHT_VIEWS_GROWTH',
            title: 'Wyświetlenia rosną',
            description: 'Kanał zanotował dodatnią zmianę wyświetleń.',
            severity: 'good',
          },
        ],
      });
      expect(generated.range.days).toBe(31);

      const exported = ReportExportResultDTOSchema.parse({
        generatedAt: '2026-02-12T23:00:00.000Z',
        exportDir: 'C:/reports/export-001',
        files: [
          {
            kind: 'kpi_summary.json',
            path: 'C:/reports/export-001/kpi_summary.json',
            sizeBytes: 120,
          },
        ],
      });

      expect(exported.files).toHaveLength(1);
    });
  });

  describe('Profile/Auth/Settings DTO', () => {
    it('validates profile create/list/set-active payloads', () => {
      const createInput = ProfileCreateInputDTOSchema.parse({
        name: 'Profil testowy',
      });
      expect(createInput.setActive).toBe(true);

      const setActiveInput = ProfileSetActiveInputDTOSchema.parse({
        profileId: 'PROFILE-TEST-001',
      });
      expect(setActiveInput.profileId).toBe('PROFILE-TEST-001');

      const listResult = ProfileListResultDTOSchema.parse({
        activeProfileId: 'PROFILE-TEST-001',
        profiles: [
          {
            id: 'PROFILE-TEST-001',
            name: 'Profil testowy',
            isActive: true,
            createdAt: '2026-02-12T23:30:00.000Z',
            updatedAt: '2026-02-12T23:30:00.000Z',
          },
        ],
      });
      expect(listResult.profiles).toHaveLength(1);
    });

    it('validates settings defaults and auth payloads', () => {
      const settings = ProfileSettingsDTOSchema.parse({});
      expect(settings.defaultDatePreset).toBe('30d');
      expect(settings.preferredForecastMetric).toBe('views');
      expect(settings.language).toBe('pl');

      const authConnectInput = AuthConnectInputDTOSchema.parse({
        provider: 'youtube',
        accountLabel: 'Kanał Testowy',
        accessToken: 'token-value',
      });
      expect(authConnectInput.provider).toBe('youtube');

      const authStatus = AuthStatusDTOSchema.parse({
        connected: true,
        provider: 'youtube',
        accountLabel: 'Kanał Testowy',
        connectedAt: '2026-02-12T23:30:00.000Z',
        storage: 'safeStorage',
      });
      expect(authStatus.connected).toBe(true);
    });
  });

  describe('CSV import and search DTO', () => {
    it('applies defaults and validates CSV import preview payloads', () => {
      const previewInput = CsvImportPreviewInputDTOSchema.parse({
        channelId: 'UC123',
        csvText: 'date,views,subscribers,videos\n2026-01-01,100,10,1',
      });
      expect(previewInput.sourceName).toBe('manual-csv');
      expect(previewInput.delimiter).toBe('auto');
      expect(previewInput.hasHeader).toBe(true);
      expect(previewInput.previewRowsLimit).toBe(10);

      const previewResult = CsvImportPreviewResultDTOSchema.parse({
        channelId: 'UC123',
        sourceName: 'manual-csv',
        detectedDelimiter: 'comma',
        headers: ['date', 'views', 'subscribers', 'videos'],
        rowsTotal: 1,
        sampleRows: [
          {
            date: '2026-01-01',
            views: '100',
            subscribers: '10',
            videos: '1',
          },
        ],
        suggestedMapping: {
          date: 'date',
          views: 'views',
          subscribers: 'subscribers',
          videos: 'videos',
        },
      });
      expect(previewResult.rowsTotal).toBe(1);
    });

    it('validates CSV import run and search payloads', () => {
      const runInput = CsvImportRunInputDTOSchema.parse({
        channelId: 'UC123',
        csvText: 'date,views,subscribers,videos\n2026-01-01,100,10,1',
        mapping: {
          date: 'date',
          views: 'views',
          subscribers: 'subscribers',
          videos: 'videos',
        },
      });
      expect(runInput.sourceName).toBe('manual-csv');

      const runResult = CsvImportRunResultDTOSchema.parse({
        importId: 1,
        channelId: 'UC123',
        sourceName: 'manual-csv',
        rowsTotal: 2,
        rowsValid: 1,
        rowsInvalid: 1,
        importedDateFrom: '2026-01-01',
        importedDateTo: '2026-01-01',
        pipelineFeatures: 90,
        latestFeatureDate: '2026-01-01',
        validationIssues: [
          {
            rowNumber: 3,
            column: 'views',
            code: 'CSV_IMPORT_INVALID_NUMBER',
            message: 'Wartosc metryki nie jest liczba nieujemna.',
            value: 'abc',
          },
        ],
      });
      expect(runResult.validationIssues).toHaveLength(1);

      const searchInput = SearchContentInputDTOSchema.parse({
        channelId: 'UC123',
        query: 'test',
      });
      expect(searchInput.limit).toBe(20);
      expect(searchInput.offset).toBe(0);

      const searchResult = SearchContentResultDTOSchema.parse({
        channelId: 'UC123',
        query: 'test',
        total: 1,
        items: [
          {
            documentId: 'video:VID-001',
            videoId: 'VID-001',
            title: 'Testowy film',
            publishedAt: '2026-01-01T00:00:00.000Z',
            snippet: '... <mark>test</mark> ...',
            source: 'title',
            score: -2.5,
          },
        ],
      });
      expect(searchResult.items).toHaveLength(1);
    });
  });

  describe('Channel constants', () => {
    it('IPC_CHANNELS has expected keys', () => {
      expect(IPC_CHANNELS.APP_GET_STATUS).toBe('app:getStatus');
      expect(IPC_CHANNELS.APP_GET_DATA_MODE).toBe('app:getDataMode');
      expect(IPC_CHANNELS.APP_SET_DATA_MODE).toBe('app:setDataMode');
      expect(IPC_CHANNELS.APP_PROBE_DATA_MODE).toBe('app:probeDataMode');
      expect(IPC_CHANNELS.IMPORT_CSV_PREVIEW).toBe('import:previewCsv');
      expect(IPC_CHANNELS.IMPORT_CSV_RUN).toBe('import:runCsv');
      expect(IPC_CHANNELS.SEARCH_CONTENT).toBe('search:content');
      expect(IPC_CHANNELS.PROFILE_LIST).toBe('profile:list');
      expect(IPC_CHANNELS.PROFILE_CREATE).toBe('profile:create');
      expect(IPC_CHANNELS.PROFILE_SET_ACTIVE).toBe('profile:setActive');
      expect(IPC_CHANNELS.SETTINGS_GET).toBe('settings:get');
      expect(IPC_CHANNELS.SETTINGS_UPDATE).toBe('settings:update');
      expect(IPC_CHANNELS.AUTH_GET_STATUS).toBe('auth:getStatus');
      expect(IPC_CHANNELS.AUTH_CONNECT).toBe('auth:connect');
      expect(IPC_CHANNELS.AUTH_DISCONNECT).toBe('auth:disconnect');
      expect(IPC_CHANNELS.SYNC_START).toBe('sync:start');
      expect(IPC_CHANNELS.SYNC_RESUME).toBe('sync:resume');
      expect(IPC_CHANNELS.ML_RUN_BASELINE).toBe('ml:runBaseline');
      expect(IPC_CHANNELS.ML_GET_FORECAST).toBe('ml:getForecast');
      expect(IPC_CHANNELS.ML_DETECT_ANOMALIES).toBe('ml:detectAnomalies');
      expect(IPC_CHANNELS.ML_GET_ANOMALIES).toBe('ml:getAnomalies');
      expect(IPC_CHANNELS.ML_GET_TREND).toBe('ml:getTrend');
      expect(IPC_CHANNELS.REPORTS_GENERATE).toBe('reports:generate');
      expect(IPC_CHANNELS.REPORTS_EXPORT).toBe('reports:export');
      expect(IPC_CHANNELS.DB_GET_KPIS).toBe('db:getKpis');
      expect(IPC_CHANNELS.DB_GET_TIMESERIES).toBe('db:getTimeseries');
      expect(IPC_CHANNELS.DB_GET_CHANNEL_INFO).toBe('db:getChannelInfo');
    });

    it('IPC_EVENTS has expected keys', () => {
      expect(IPC_EVENTS.SYNC_PROGRESS).toBe('sync:progress');
      expect(IPC_EVENTS.SYNC_COMPLETE).toBe('sync:complete');
      expect(IPC_EVENTS.SYNC_ERROR).toBe('sync:error');
    });
  });
});
