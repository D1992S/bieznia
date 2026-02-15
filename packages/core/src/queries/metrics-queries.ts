import type Database from 'better-sqlite3';
import { AppError, err, ok, type KpiQueryDTO, type KpiResultDTO, type Result, type TimeseriesQueryDTO, type TimeseriesResultDTO } from '@moze/shared';

interface AggregateTotalsRow {
  views: number;
  likes: number;
  comments: number;
}

interface LatestSnapshotRow {
  subscribers: number;
  videos: number;
}

interface ChannelSnapshotRow {
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
}

interface TimeseriesRow {
  pointDate: string;
  value: number;
}

type TimeseriesMetric = TimeseriesQueryDTO['metric'];
type TimeseriesGranularity = TimeseriesQueryDTO['granularity'];

export interface MetricsQueries {
  getKpis: (query: KpiQueryDTO) => Result<KpiResultDTO, AppError>;
  getTimeseries: (query: TimeseriesQueryDTO) => Result<TimeseriesResultDTO, AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

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
    return err(
      AppError.create('DB_INVALID_DATE', 'Zakres dat jest niepoprawny.', 'error', {
        dateFrom,
        dateTo,
      }),
    );
  }

  if (from > to) {
    return err(
      AppError.create('DB_INVALID_DATE_RANGE', 'Data początkowa nie może być późniejsza niż końcowa.', 'error', {
        dateFrom,
        dateTo,
      }),
    );
  }

  return ok(undefined);
}

function mapMetricExpression(metric: TimeseriesMetric): string {
  switch (metric) {
    case 'views':
      return 'views';
    case 'subscribers':
      return 'subscribers';
    case 'likes':
      return 'likes';
    case 'comments':
      return 'comments';
  }
}

function mapGranularityBucket(granularity: TimeseriesGranularity): string {
  switch (granularity) {
    case 'day':
      return 'date';
    case 'week':
      return "date(date, '-' || ((CAST(strftime('%w', date) AS INTEGER) + 6) % 7) || ' days')";
    case 'month':
      return "strftime('%Y-%m-01', date)";
  }
}

export function createMetricsQueries(db: Database.Database): MetricsQueries {
  const aggregateTotalsStmt = db.prepare<{ channelId: string; dateFrom: string; dateTo: string }, AggregateTotalsRow>(
    `
      SELECT
        COALESCE(SUM(views), 0) AS views,
        COALESCE(SUM(likes), 0) AS likes,
        COALESCE(SUM(comments), 0) AS comments
      FROM fact_channel_day
      WHERE channel_id = @channelId
        AND date BETWEEN @dateFrom AND @dateTo
      ORDER BY date ASC
    `,
  );

  const latestSnapshotStmt = db.prepare<{ channelId: string; dateFrom: string; dateTo: string }, LatestSnapshotRow>(
    `
      SELECT
        subscribers,
        videos
      FROM fact_channel_day
      WHERE channel_id = @channelId
        AND date BETWEEN @dateFrom AND @dateTo
      ORDER BY date DESC
      LIMIT 1
    `,
  );

  const channelSnapshotStmt = db.prepare<{ channelId: string }, ChannelSnapshotRow>(
    `
      SELECT
        subscriber_count AS subscriberCount,
        video_count AS videoCount,
        view_count AS viewCount
      FROM dim_channel
      WHERE channel_id = @channelId
      ORDER BY channel_id ASC
      LIMIT 1
    `,
  );

  return {
    getKpis: (query) => {
      const rangeValidation = validateDateRange(query.dateFrom, query.dateTo);
      if (!rangeValidation.ok) {
        return rangeValidation;
      }

      try {
        const currentTotals = aggregateTotalsStmt.get(query) ?? {
          views: 0,
          likes: 0,
          comments: 0,
        };

        const currentLatestRow = latestSnapshotStmt.get(query);
        const currentLatest = currentLatestRow ?? {
          subscribers: 0,
          videos: 0,
        };

        const channelSnapshot = channelSnapshotStmt.get({ channelId: query.channelId });
        const shouldUseSnapshotFallback = currentLatestRow === undefined;

        const effectiveSubscribers =
          currentLatest.subscribers > 0 || !shouldUseSnapshotFallback
            ? currentLatest.subscribers
            : (channelSnapshot?.subscriberCount ?? currentLatest.subscribers);

        const effectiveVideos =
          currentLatest.videos > 0 || !shouldUseSnapshotFallback
            ? currentLatest.videos
            : (channelSnapshot?.videoCount ?? currentLatest.videos);

        const effectiveViews =
          currentTotals.views > 0 || !shouldUseSnapshotFallback
            ? currentTotals.views
            : (channelSnapshot?.viewCount ?? currentTotals.views);

        const daySpan = inclusiveDaySpan(query.dateFrom, query.dateTo);
        const previousDateTo = shiftDays(query.dateFrom, -1);
        const previousDateFrom = shiftDays(previousDateTo, -(daySpan - 1));

        const previousTotals = aggregateTotalsStmt.get({
          channelId: query.channelId,
          dateFrom: previousDateFrom,
          dateTo: previousDateTo,
        }) ?? {
          views: 0,
          likes: 0,
          comments: 0,
        };

        const previousLatest = latestSnapshotStmt.get({
          channelId: query.channelId,
          dateFrom: previousDateFrom,
          dateTo: previousDateTo,
        }) ?? {
          subscribers: 0,
          videos: 0,
        };

        const avgViewsPerVideo = effectiveVideos > 0 ? effectiveViews / effectiveVideos : 0;
        const engagementRate = effectiveViews > 0
          ? (currentTotals.likes + currentTotals.comments) / effectiveViews
          : 0;

        return ok({
          subscribers: effectiveSubscribers,
          subscribersDelta: effectiveSubscribers - previousLatest.subscribers,
          views: effectiveViews,
          viewsDelta: currentTotals.views - previousTotals.views,
          videos: effectiveVideos,
          videosDelta: effectiveVideos - previousLatest.videos,
          avgViewsPerVideo,
          engagementRate,
        });
      } catch (cause) {
        return err(
          AppError.create(
            'DB_QUERY_KPIS_FAILED',
            'Nie udało się pobrać KPI.',
            'error',
            {
              channelId: query.channelId,
              dateFrom: query.dateFrom,
              dateTo: query.dateTo,
            },
            toError(cause),
          ),
        );
      }
    },

    getTimeseries: (query) => {
      const rangeValidation = validateDateRange(query.dateFrom, query.dateTo);
      if (!rangeValidation.ok) {
        return rangeValidation;
      }

      const metricExpression = mapMetricExpression(query.metric);
      const bucketExpression = mapGranularityBucket(query.granularity);
      const aggregationExpression = query.metric === 'subscribers'
        ? `MAX(${metricExpression})`
        : `SUM(${metricExpression})`;

      const timeseriesSql = `
        SELECT
          ${bucketExpression} AS pointDate,
          ${aggregationExpression} AS value
        FROM fact_channel_day
        WHERE channel_id = @channelId
          AND date BETWEEN @dateFrom AND @dateTo
        GROUP BY pointDate
        ORDER BY pointDate ASC
      `;

      try {
        const rows = db
          .prepare<{ channelId: string; dateFrom: string; dateTo: string }, TimeseriesRow>(timeseriesSql)
          .all({
            channelId: query.channelId,
            dateFrom: query.dateFrom,
            dateTo: query.dateTo,
          });

        return ok({
          metric: query.metric,
          granularity: query.granularity,
          points: rows.map((row) => ({
            date: row.pointDate,
            value: row.value,
          })),
        });
      } catch (cause) {
        return err(
          AppError.create(
            'DB_QUERY_TIMESERIES_FAILED',
            'Nie udało się pobrać szeregu czasowego.',
            'error',
            {
              channelId: query.channelId,
              metric: query.metric,
              dateFrom: query.dateFrom,
              dateTo: query.dateTo,
              granularity: query.granularity,
            },
            toError(cause),
          ),
        );
      }
    },
  };
}
