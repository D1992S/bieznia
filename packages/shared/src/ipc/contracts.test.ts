import { describe, it, expect } from 'vitest';
import {
  AppStatusDTOSchema,
  DataModeProbeInputDTOSchema,
  DataModeProbeResultDTOSchema,
  DataModeSchema,
  DataModeStatusDTOSchema,
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

  describe('Channel constants', () => {
    it('IPC_CHANNELS has expected keys', () => {
      expect(IPC_CHANNELS.APP_GET_STATUS).toBe('app:getStatus');
      expect(IPC_CHANNELS.APP_GET_DATA_MODE).toBe('app:getDataMode');
      expect(IPC_CHANNELS.APP_SET_DATA_MODE).toBe('app:setDataMode');
      expect(IPC_CHANNELS.APP_PROBE_DATA_MODE).toBe('app:probeDataMode');
      expect(IPC_CHANNELS.SYNC_START).toBe('sync:start');
      expect(IPC_CHANNELS.SYNC_RESUME).toBe('sync:resume');
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
