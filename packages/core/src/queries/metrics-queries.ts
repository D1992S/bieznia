import type Database from 'better-sqlite3';
import {
  AppError,
  KpiResultDTOSchema,
  TimeseriesResultDTOSchema,
  type KpiQueryDTO,
  type KpiResultDTO,
  type Result,
  type TimeseriesQueryDTO,
  type TimeseriesResultDTO,
} from '@moze/shared';
import {
  createSemanticMetricService,
  type SemanticMetricId,
} from '../semantic/index.ts';
import { runWithAnalyticsTrace } from '../observability/analytics-tracing.ts';
import type { AnalyticsQueryCache } from '../observability/analytics-query-cache.ts';

export interface MetricsQueries {
  getKpis: (query: KpiQueryDTO) => Result<KpiResultDTO, AppError>;
  getTimeseries: (query: TimeseriesQueryDTO) => Result<TimeseriesResultDTO, AppError>;
}

export interface CreateMetricsQueriesOptions {
  cache?: AnalyticsQueryCache;
  cacheTtlMs?: {
    getKpis?: number;
    getTimeseries?: number;
  };
}

const DEFAULT_KPI_CACHE_TTL_MS = 30_000;
const DEFAULT_TIMESERIES_CACHE_TTL_MS = 30_000;

function parseIsoDate(date: string): Date {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return parsed;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDays(dateIso: string, days: number): string {
  const date = parseIsoDate(dateIso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
}

function inclusiveDaySpan(dateFrom: string, dateTo: string): number {
  const from = parseIsoDate(dateFrom).getTime();
  const to = parseIsoDate(dateTo).getTime();
  return Math.floor((to - from) / 86_400_000) + 1;
}

function validateDateRange(dateFrom: string, dateTo: string): Result<void, AppError> {
  const from = parseIsoDate(dateFrom).getTime();
  const to = parseIsoDate(dateTo).getTime();

  if (Number.isNaN(from) || Number.isNaN(to)) {
    return {
      ok: false,
      error: AppError.create('DB_INVALID_DATE', 'Nieprawidlowy zakres dat.', 'error', {
        dateFrom,
        dateTo,
      }),
    };
  }

  if (from > to) {
    return {
      ok: false,
      error: AppError.create(
        'DB_INVALID_DATE_RANGE',
        'Data poczatkowa nie moze byc pozniejsza niz data koncowa.',
        'error',
        {
          dateFrom,
          dateTo,
        },
      ),
    };
  }

  return { ok: true, value: undefined };
}

function validateCachedKpiPayload(payload: unknown): Result<KpiResultDTO, AppError> {
  const parsed = KpiResultDTOSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: AppError.create(
        'DB_KPI_CACHE_PAYLOAD_INVALID',
        'Niepoprawny payload cache KPI.',
        'error',
        { issues: parsed.error.issues },
      ),
    };
  }
  return { ok: true, value: parsed.data };
}

function validateCachedTimeseriesPayload(payload: unknown): Result<TimeseriesResultDTO, AppError> {
  const parsed = TimeseriesResultDTOSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: AppError.create(
        'DB_TIMESERIES_CACHE_PAYLOAD_INVALID',
        'Niepoprawny payload cache szeregu czasowego.',
        'error',
        { issues: parsed.error.issues },
      ),
    };
  }
  return { ok: true, value: parsed.data };
}

export function createMetricsQueries(
  db: Database.Database,
  options: CreateMetricsQueriesOptions = {},
): MetricsQueries {
  const semanticMetrics = createSemanticMetricService(db);
  const cache = options.cache;
  const kpiCacheTtlMs = Math.max(1, Math.floor(options.cacheTtlMs?.getKpis ?? DEFAULT_KPI_CACHE_TTL_MS));
  const timeseriesCacheTtlMs = Math.max(
    1,
    Math.floor(options.cacheTtlMs?.getTimeseries ?? DEFAULT_TIMESERIES_CACHE_TTL_MS),
  );

  return {
    getKpis: (query) => {
      const rangeValidation = validateDateRange(query.dateFrom, query.dateTo);
      if (!rangeValidation.ok) {
        return rangeValidation;
      }

      const daySpan = inclusiveDaySpan(query.dateFrom, query.dateTo);
      const previousDateTo = shiftDays(query.dateFrom, -1);
      const previousDateFrom = shiftDays(previousDateTo, -(daySpan - 1));

      const currentMetricIds: readonly SemanticMetricId[] = [
        'channel.views.total',
        'channel.likes.total',
        'channel.comments.total',
        'channel.subscribers.latest',
        'channel.videos.latest',
        'channel.avg_views_per_video',
        'channel.engagement_rate',
      ];
      const previousMetricIds: readonly SemanticMetricId[] = [
        'channel.views.total',
        'channel.subscribers.latest',
        'channel.videos.latest',
      ];

      const computeKpis = (): Result<KpiResultDTO, AppError> => {
        const currentValuesResult = semanticMetrics.readMetricValues({
          metricIds: currentMetricIds,
          channelId: query.channelId,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
        });
        if (!currentValuesResult.ok) {
          return currentValuesResult;
        }

        const previousValuesResult = semanticMetrics.readMetricValues({
          metricIds: previousMetricIds,
          channelId: query.channelId,
          dateFrom: previousDateFrom,
          dateTo: previousDateTo,
        });
        if (!previousValuesResult.ok) {
          return previousValuesResult;
        }

        const currentValues = currentValuesResult.value;
        const previousValues = previousValuesResult.value;

        return {
          ok: true,
          value: {
            subscribers: currentValues['channel.subscribers.latest'],
            subscribersDelta:
              currentValues['channel.subscribers.latest'] - previousValues['channel.subscribers.latest'],
            views: currentValues['channel.views.total'],
            viewsDelta: currentValues['channel.views.total'] - previousValues['channel.views.total'],
            videos: currentValues['channel.videos.latest'],
            videosDelta: currentValues['channel.videos.latest'] - previousValues['channel.videos.latest'],
            avgViewsPerVideo: currentValues['channel.avg_views_per_video'],
            engagementRate: currentValues['channel.engagement_rate'],
          },
        };
      };

      return runWithAnalyticsTrace({
        db,
        operationName: 'metrics.getKpis',
        params: {
          channelId: query.channelId,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
        },
        lineage: [
          {
            sourceTable: 'fact_channel_day',
            primaryKeys: ['channel_id', 'date'],
            dateFrom: query.dateFrom,
            dateTo: query.dateTo,
            filters: {
              channelId: query.channelId,
              window: 'current',
            },
          },
          {
            sourceTable: 'fact_channel_day',
            primaryKeys: ['channel_id', 'date'],
            dateFrom: previousDateFrom,
            dateTo: previousDateTo,
            filters: {
              channelId: query.channelId,
              window: 'previous',
            },
          },
          {
            sourceTable: 'dim_channel',
            primaryKeys: ['channel_id'],
            filters: {
              channelId: query.channelId,
              fallback: true,
            },
          },
        ],
        estimateRowCount: () => 1,
        execute: () =>
          cache
            ? cache.getOrCompute({
                metricId: 'metrics.getKpis.v1',
                params: {
                  channelId: query.channelId,
                  dateFrom: query.dateFrom,
                  dateTo: query.dateTo,
                },
                ttlMs: kpiCacheTtlMs,
                execute: () => computeKpis(),
                validate: (payload) => validateCachedKpiPayload(payload),
              })
            : computeKpis(),
      });
    },

    getTimeseries: (query) => {
      const rangeValidation = validateDateRange(query.dateFrom, query.dateTo);
      if (!rangeValidation.ok) {
        return rangeValidation;
      }

      const computeTimeseries = (): Result<TimeseriesResultDTO, AppError> =>
        semanticMetrics.readTimeseries(query);

      return runWithAnalyticsTrace({
        db,
        operationName: 'metrics.getTimeseries',
        params: {
          channelId: query.channelId,
          metric: query.metric,
          granularity: query.granularity,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
        },
        lineage: [
          {
            sourceTable: 'fact_channel_day',
            primaryKeys: ['channel_id', 'date'],
            dateFrom: query.dateFrom,
            dateTo: query.dateTo,
            filters: {
              channelId: query.channelId,
              metric: query.metric,
              granularity: query.granularity,
            },
          },
        ],
        estimateRowCount: (value) => value.points.length,
        execute: () =>
          cache
            ? cache.getOrCompute({
                metricId: 'metrics.getTimeseries.v1',
                params: {
                  channelId: query.channelId,
                  metric: query.metric,
                  granularity: query.granularity,
                  dateFrom: query.dateFrom,
                  dateTo: query.dateTo,
                },
                ttlMs: timeseriesCacheTtlMs,
                execute: () => computeTimeseries(),
                validate: (payload) => validateCachedTimeseriesPayload(payload),
              })
            : computeTimeseries(),
      });
    },
  };
}
