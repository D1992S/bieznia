import { describe, it, expect } from 'vitest';
import {
  AppStatusDTOSchema,
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

  describe('Channel constants', () => {
    it('IPC_CHANNELS has expected keys', () => {
      expect(IPC_CHANNELS.APP_GET_STATUS).toBe('app:getStatus');
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
