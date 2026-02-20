import type Database from 'better-sqlite3';
import {
  AppError,
  err,
  ok,
  type Result,
  type TimeseriesQueryDTO,
  type TimeseriesResultDTO,
} from '@moze/shared';

export type SemanticMetricId =
  | 'channel.views.total'
  | 'channel.likes.total'
  | 'channel.comments.total'
  | 'channel.subscribers.latest'
  | 'channel.videos.latest'
  | 'channel.watch_time_minutes.total'
  | 'channel.avg_views_per_video'
  | 'channel.engagement_rate'
  | 'channel.views.timeseries'
  | 'channel.subscribers.timeseries'
  | 'channel.likes.timeseries'
  | 'channel.comments.timeseries'
  | 'ml.anomalies.count'
  | 'ml.anomalies.critical_count'
  | 'ml.forecast.points_count'
  | 'ml.models.active_count'
  | 'content.documents.count'
  | 'video.views.max'
  | 'channel.snapshot.views'
  | 'channel.snapshot.subscribers';

type SemanticMetricUnit = 'count' | 'ratio' | 'minutes';

interface SemanticMetricDefinitionBase {
  id: SemanticMetricId;
  label: string;
  description: string;
  unit: SemanticMetricUnit;
}

interface RawMetricDefinition extends SemanticMetricDefinitionBase {
  kind: 'raw';
  sourceTable:
    | 'fact_channel_day'
    | 'dim_channel'
    | 'dim_video'
    | 'ml_anomalies'
    | 'ml_predictions'
    | 'ml_models'
    | 'dim_content_documents';
  aggregation: 'sum' | 'max' | 'latest' | 'count' | 'snapshot';
  sourceColumn: string;
  fallbackDimensionColumn?: string;
  staticWhereSql?: string;
}

interface DerivedMetricDefinition extends SemanticMetricDefinitionBase {
  kind: 'derived';
  dependencies: readonly SemanticMetricId[];
  compute: (values: Record<SemanticMetricId, number>) => number;
}

export type SemanticMetricDefinition = RawMetricDefinition | DerivedMetricDefinition;

export interface ReadSemanticMetricValueInput {
  metricId: SemanticMetricId;
  channelId: string;
  dateFrom: string;
  dateTo: string;
}

export interface ReadSemanticMetricValuesInput {
  metricIds: readonly SemanticMetricId[];
  channelId: string;
  dateFrom: string;
  dateTo: string;
}

export interface SemanticMetricService {
  listMetricDefinitions: () => readonly SemanticMetricDefinition[];
  readMetricValue: (input: ReadSemanticMetricValueInput) => Result<number, AppError>;
  readMetricValues: (
    input: ReadSemanticMetricValuesInput,
  ) => Result<Record<SemanticMetricId, number>, AppError>;
  readTimeseries: (input: TimeseriesQueryDTO) => Result<TimeseriesResultDTO, AppError>;
}

const METRIC_CATALOG: readonly SemanticMetricDefinition[] = [
  {
    id: 'channel.views.total',
    kind: 'raw',
    label: 'Wyświetlenia (suma)',
    description: 'Suma dziennych wyświetleń kanału w wybranym zakresie.',
    unit: 'count',
    sourceTable: 'fact_channel_day',
    aggregation: 'sum',
    sourceColumn: 'views',
    fallbackDimensionColumn: 'view_count',
  },
  {
    id: 'channel.likes.total',
    kind: 'raw',
    label: 'Polubienia (suma)',
    description: 'Suma dziennych polubień kanału w wybranym zakresie.',
    unit: 'count',
    sourceTable: 'fact_channel_day',
    aggregation: 'sum',
    sourceColumn: 'likes',
  },
  {
    id: 'channel.comments.total',
    kind: 'raw',
    label: 'Komentarze (suma)',
    description: 'Suma dziennych komentarzy kanału w wybranym zakresie.',
    unit: 'count',
    sourceTable: 'fact_channel_day',
    aggregation: 'sum',
    sourceColumn: 'comments',
  },
  {
    id: 'channel.subscribers.latest',
    kind: 'raw',
    label: 'Subskrybenci (ostatni punkt)',
    description: 'Ostatnia liczba subskrybentów z szeregu czasowego.',
    unit: 'count',
    sourceTable: 'fact_channel_day',
    aggregation: 'latest',
    sourceColumn: 'subscribers',
    fallbackDimensionColumn: 'subscriber_count',
  },
  {
    id: 'channel.videos.latest',
    kind: 'raw',
    label: 'Filmy (ostatni punkt)',
    description: 'Ostatnia liczba filmów z szeregu czasowego.',
    unit: 'count',
    sourceTable: 'fact_channel_day',
    aggregation: 'latest',
    sourceColumn: 'videos',
    fallbackDimensionColumn: 'video_count',
  },
  {
    id: 'channel.watch_time_minutes.total',
    kind: 'raw',
    label: 'Watch time (minuty, suma)',
    description: 'Suma czasu oglądania w minutach.',
    unit: 'minutes',
    sourceTable: 'fact_channel_day',
    aggregation: 'sum',
    sourceColumn: 'watch_time_minutes',
  },
  {
    id: 'channel.avg_views_per_video',
    kind: 'derived',
    label: 'Średnie wyświetlenia na film',
    description: 'Wyświetlenia podzielone przez liczbę filmów.',
    unit: 'count',
    dependencies: ['channel.views.total', 'channel.videos.latest'],
    compute: (values) => {
      const views = values['channel.views.total'];
      const videos = values['channel.videos.latest'];
      return videos > 0 ? views / videos : 0;
    },
  },
  {
    id: 'channel.engagement_rate',
    kind: 'derived',
    label: 'Engagement rate',
    description: 'Stosunek (likes + comments) do views.',
    unit: 'ratio',
    dependencies: ['channel.likes.total', 'channel.comments.total', 'channel.views.total'],
    compute: (values) => {
      const likes = values['channel.likes.total'];
      const comments = values['channel.comments.total'];
      const views = values['channel.views.total'];
      return views > 0 ? (likes + comments) / views : 0;
    },
  },
  {
    id: 'channel.views.timeseries',
    kind: 'raw',
    label: 'Szereg: wyświetlenia',
    description: 'Dzienny szereg wyświetleń kanału.',
    unit: 'count',
    sourceTable: 'fact_channel_day',
    aggregation: 'sum',
    sourceColumn: 'views',
  },
  {
    id: 'channel.subscribers.timeseries',
    kind: 'raw',
    label: 'Szereg: subskrybenci',
    description: 'Dzienny szereg subskrybentów kanału.',
    unit: 'count',
    sourceTable: 'fact_channel_day',
    aggregation: 'max',
    sourceColumn: 'subscribers',
  },
  {
    id: 'channel.likes.timeseries',
    kind: 'raw',
    label: 'Szereg: polubienia',
    description: 'Dzienny szereg polubień kanału.',
    unit: 'count',
    sourceTable: 'fact_channel_day',
    aggregation: 'sum',
    sourceColumn: 'likes',
  },
  {
    id: 'channel.comments.timeseries',
    kind: 'raw',
    label: 'Szereg: komentarze',
    description: 'Dzienny szereg komentarzy kanału.',
    unit: 'count',
    sourceTable: 'fact_channel_day',
    aggregation: 'sum',
    sourceColumn: 'comments',
  },
  {
    id: 'ml.anomalies.count',
    kind: 'raw',
    label: 'Liczba anomalii',
    description: 'Liczba wykrytych anomalii dla kanału.',
    unit: 'count',
    sourceTable: 'ml_anomalies',
    aggregation: 'count',
    sourceColumn: 'id',
  },
  {
    id: 'ml.anomalies.critical_count',
    kind: 'raw',
    label: 'Liczba anomalii krytycznych',
    description: 'Liczba anomalii o severity = critical.',
    unit: 'count',
    sourceTable: 'ml_anomalies',
    aggregation: 'count',
    sourceColumn: 'id',
    staticWhereSql: "severity = 'critical'",
  },
  {
    id: 'ml.forecast.points_count',
    kind: 'raw',
    label: 'Liczba punktów prognozy',
    description: 'Liczba punktów p10/p50/p90 dla kanału.',
    unit: 'count',
    sourceTable: 'ml_predictions',
    aggregation: 'count',
    sourceColumn: 'id',
  },
  {
    id: 'ml.models.active_count',
    kind: 'raw',
    label: 'Liczba aktywnych modeli',
    description: 'Liczba aktywnych modeli ML dla kanału.',
    unit: 'count',
    sourceTable: 'ml_models',
    aggregation: 'count',
    sourceColumn: 'id',
    staticWhereSql: 'is_active = 1',
  },
  {
    id: 'content.documents.count',
    kind: 'raw',
    label: 'Liczba dokumentów contentu',
    description: 'Liczba dokumentów (title/description/transcript) przypiętych do kanału.',
    unit: 'count',
    sourceTable: 'dim_content_documents',
    aggregation: 'count',
    sourceColumn: 'document_id',
  },
  {
    id: 'video.views.max',
    kind: 'raw',
    label: 'Maksymalne wyświetlenia filmu',
    description: 'Maksymalna liczba wyświetleń pojedynczego filmu.',
    unit: 'count',
    sourceTable: 'dim_video',
    aggregation: 'max',
    sourceColumn: 'view_count',
  },
  {
    id: 'channel.snapshot.views',
    kind: 'raw',
    label: 'Snapshot views',
    description: 'Snapshotowa liczba wyświetleń z dim_channel.',
    unit: 'count',
    sourceTable: 'dim_channel',
    aggregation: 'snapshot',
    sourceColumn: 'view_count',
  },
  {
    id: 'channel.snapshot.subscribers',
    kind: 'raw',
    label: 'Snapshot subscribers',
    description: 'Snapshotowa liczba subskrybentów z dim_channel.',
    unit: 'count',
    sourceTable: 'dim_channel',
    aggregation: 'snapshot',
    sourceColumn: 'subscriber_count',
  },
];

const METRIC_BY_ID = new Map<SemanticMetricId, SemanticMetricDefinition>();
for (const definition of METRIC_CATALOG) {
  METRIC_BY_ID.set(definition.id, definition);
}

const TIMESERIES_METRIC_MAP: Record<TimeseriesQueryDTO['metric'], string> = {
  views: 'views',
  subscribers: 'subscribers',
  likes: 'likes',
  comments: 'comments',
};

function parseIsoDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function validateDateRange(dateFrom: string, dateTo: string): Result<void, AppError> {
  const from = parseIsoDate(dateFrom).getTime();
  const to = parseIsoDate(dateTo).getTime();

  if (Number.isNaN(from) || Number.isNaN(to)) {
    return err(
      AppError.create('SEMANTIC_METRIC_INVALID_DATE', 'Metric date range is invalid.', 'error', {
        dateFrom,
        dateTo,
      }),
    );
  }

  if (from > to) {
    return err(
      AppError.create(
        'SEMANTIC_METRIC_INVALID_DATE_RANGE',
        'Start date cannot be later than end date.',
        'error',
        { dateFrom, dateTo },
      ),
    );
  }

  return ok(undefined);
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function readSnapshotMetric(
  db: Database.Database,
  metric: RawMetricDefinition,
  channelId: string,
): Result<number, AppError> {
  const sql = `
    SELECT
      COALESCE(${metric.sourceColumn}, 0) AS value
    FROM dim_channel
    WHERE channel_id = @channelId
    ORDER BY channel_id ASC
    LIMIT 1
  `;

  try {
    const row = db.prepare<{ channelId: string }, { value: number }>(sql).get({ channelId });
    return ok(row?.value ?? 0);
  } catch (cause) {
    return err(
      AppError.create(
        'SEMANTIC_METRIC_SNAPSHOT_READ_FAILED',
        'Failed to read metric snapshot.',
        'error',
        { metricId: metric.id, channelId },
        toError(cause),
      ),
    );
  }
}

function readFactMetric(
  db: Database.Database,
  metric: RawMetricDefinition,
  input: { channelId: string; dateFrom: string; dateTo: string },
): Result<number, AppError> {
  const whereExtra = metric.staticWhereSql ? ` AND ${metric.staticWhereSql}` : '';

  if (metric.aggregation === 'latest') {
    const latestSql = `
      SELECT
        ${metric.sourceColumn} AS value
      FROM fact_channel_day
      WHERE channel_id = @channelId
        AND date BETWEEN @dateFrom AND @dateTo
        ${whereExtra}
      ORDER BY date DESC
      LIMIT 1
    `;

    try {
      const latestRow = db
        .prepare<{ channelId: string; dateFrom: string; dateTo: string }, { value: number }>(latestSql)
        .get({
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        });

      if (latestRow) {
        return ok(latestRow.value);
      }

      if (!metric.fallbackDimensionColumn) {
        return ok(0);
      }

      const fallbackSql = `
        SELECT
          COALESCE(${metric.fallbackDimensionColumn}, 0) AS value
        FROM dim_channel
        WHERE channel_id = @channelId
        ORDER BY channel_id ASC
        LIMIT 1
      `;
      const fallbackRow = db.prepare<{ channelId: string }, { value: number }>(fallbackSql).get({
        channelId: input.channelId,
      });
      return ok(fallbackRow?.value ?? 0);
    } catch (cause) {
      return err(
        AppError.create(
          'SEMANTIC_METRIC_LATEST_READ_FAILED',
          'Failed to read the latest metric value.',
          'error',
          {
            metricId: metric.id,
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
          },
          toError(cause),
        ),
      );
    }
  }

  const aggregationSql = metric.aggregation === 'max'
    ? 'MAX'
    : metric.aggregation === 'count'
      ? 'COUNT'
      : 'SUM';

  const aggregateSql = `
    SELECT
      COALESCE(${aggregationSql}(${metric.sourceColumn}), 0) AS value,
      COUNT(*) AS rowCount
    FROM fact_channel_day
    WHERE channel_id = @channelId
      AND date BETWEEN @dateFrom AND @dateTo
      ${whereExtra}
  `;

  try {
    const aggregateRow = db
      .prepare<{ channelId: string; dateFrom: string; dateTo: string }, { value: number; rowCount: number }>(
        aggregateSql,
      )
      .get({
        channelId: input.channelId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      });

    const value = aggregateRow?.value ?? 0;
    const rowCount = aggregateRow?.rowCount ?? 0;
    if (rowCount > 0 || !metric.fallbackDimensionColumn) {
      return ok(value);
    }

    const fallbackSql = `
      SELECT
        COALESCE(${metric.fallbackDimensionColumn}, 0) AS value
      FROM dim_channel
      WHERE channel_id = @channelId
      ORDER BY channel_id ASC
      LIMIT 1
    `;
    const fallbackRow = db.prepare<{ channelId: string }, { value: number }>(fallbackSql).get({
      channelId: input.channelId,
    });
    return ok(fallbackRow?.value ?? value);
  } catch (cause) {
    return err(
      AppError.create(
        'SEMANTIC_METRIC_FACT_READ_FAILED',
        'Failed to read metric from fact_channel_day.',
        'error',
        {
          metricId: metric.id,
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        },
        toError(cause),
      ),
    );
  }
}

function readCountFromTable(
  db: Database.Database,
  metric: RawMetricDefinition,
  input: { channelId: string; dateFrom: string; dateTo: string },
): Result<number, AppError> {
  const staticFilterSql = metric.staticWhereSql ? ` AND ${metric.staticWhereSql}` : '';
  let sql: string;

  switch (metric.sourceTable) {
    case 'ml_anomalies':
      sql = `
        SELECT COALESCE(COUNT(${metric.sourceColumn}), 0) AS value
        FROM ml_anomalies
        WHERE channel_id = @channelId
          AND date BETWEEN @dateFrom AND @dateTo
          ${staticFilterSql}
      `;
      break;
    case 'ml_predictions':
      sql = `
        SELECT COALESCE(COUNT(${metric.sourceColumn}), 0) AS value
        FROM ml_predictions
        WHERE channel_id = @channelId
          AND prediction_date BETWEEN @dateFrom AND @dateTo
          ${staticFilterSql}
      `;
      break;
    case 'ml_models':
      sql = `
        SELECT COALESCE(COUNT(${metric.sourceColumn}), 0) AS value
        FROM ml_models
        WHERE channel_id = @channelId
          AND trained_at >= @dateFrom
          AND trained_at <= @dateTo || 'T23:59:59.999Z'
          ${staticFilterSql}
      `;
      break;
    case 'dim_content_documents':
      sql = `
        SELECT COALESCE(COUNT(${metric.sourceColumn}), 0) AS value
        FROM dim_content_documents
        WHERE channel_id = @channelId
          AND COALESCE(
            substr(published_at, 1, 10),
            substr(updated_at, 1, 10)
          ) BETWEEN @dateFrom AND @dateTo
          ${staticFilterSql}
      `;
      break;
    default:
      return err(
        AppError.create(
          'SEMANTIC_METRIC_UNSUPPORTED_SOURCE',
          'Metric uses an unsupported source table.',
          'error',
          { metricId: metric.id, sourceTable: metric.sourceTable },
        ),
      );
  }

  try {
    const row = db
      .prepare<{ channelId: string; dateFrom: string; dateTo: string }, { value: number }>(sql)
      .get({
        channelId: input.channelId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      });
    return ok(row?.value ?? 0);
  } catch (cause) {
    return err(
      AppError.create(
        'SEMANTIC_METRIC_COUNT_READ_FAILED',
        'Failed to read semantic count metric.',
        'error',
        {
          metricId: metric.id,
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          sourceTable: metric.sourceTable,
        },
        toError(cause),
      ),
    );
  }
}

function readMaxVideoMetric(
  db: Database.Database,
  metric: RawMetricDefinition,
  channelId: string,
): Result<number, AppError> {
  const sql = `
    SELECT COALESCE(MAX(${metric.sourceColumn}), 0) AS value
    FROM dim_video
    WHERE channel_id = @channelId
  `;

  try {
    const row = db.prepare<{ channelId: string }, { value: number }>(sql).get({ channelId });
    return ok(row?.value ?? 0);
  } catch (cause) {
    return err(
      AppError.create(
        'SEMANTIC_METRIC_VIDEO_READ_FAILED',
        'Failed to read video metric.',
        'error',
        { metricId: metric.id, channelId },
        toError(cause),
      ),
    );
  }
}

function readRawMetricValue(
  db: Database.Database,
  metric: RawMetricDefinition,
  input: { channelId: string; dateFrom: string; dateTo: string },
): Result<number, AppError> {
  switch (metric.sourceTable) {
    case 'fact_channel_day':
      return readFactMetric(db, metric, input);
    case 'dim_channel':
      return readSnapshotMetric(db, metric, input.channelId);
    case 'dim_video':
      return readMaxVideoMetric(db, metric, input.channelId);
    case 'ml_anomalies':
    case 'ml_predictions':
    case 'ml_models':
    case 'dim_content_documents':
      return readCountFromTable(db, metric, input);
  }
}

function createTimeseriesBucketExpression(granularity: TimeseriesQueryDTO['granularity']): string {
  switch (granularity) {
    case 'day':
      return 'date';
    case 'week':
      return "date(date, '-' || ((CAST(strftime('%w', date) AS INTEGER) + 6) % 7) || ' days')";
    case 'month':
      return "strftime('%Y-%m-01', date)";
  }
}

function createTimeseriesAggregationExpression(metric: TimeseriesQueryDTO['metric'], column: string): string {
  if (metric === 'subscribers') {
    return `MAX(${column})`;
  }
  return `SUM(${column})`;
}

function resolveMetricValue(
  db: Database.Database,
  input: {
    metricId: SemanticMetricId;
    channelId: string;
    dateFrom: string;
    dateTo: string;
  },
  cache: Map<SemanticMetricId, number>,
  visiting: Set<SemanticMetricId>,
): Result<number, AppError> {
  const cached = cache.get(input.metricId);
  if (cached !== undefined) {
    return ok(cached);
  }

  if (visiting.has(input.metricId)) {
    return err(
      AppError.create(
        'SEMANTIC_METRIC_CYCLE',
        'Detected a cyclic dependency between semantic metrics.',
        'error',
        { metricId: input.metricId },
      ),
    );
  }

  const definition = METRIC_BY_ID.get(input.metricId);
  if (!definition) {
    return err(
      AppError.create(
        'SEMANTIC_METRIC_NOT_FOUND',
        'Semantic metric was not found.',
        'error',
        { metricId: input.metricId },
      ),
    );
  }

  visiting.add(input.metricId);

  if (definition.kind === 'raw') {
    const rawResult = readRawMetricValue(db, definition, input);
    visiting.delete(input.metricId);
    if (!rawResult.ok) {
      return rawResult;
    }
    cache.set(input.metricId, rawResult.value);
    return ok(rawResult.value);
  }

  const dependencyValues: Record<SemanticMetricId, number> = {
    'channel.views.total': 0,
    'channel.likes.total': 0,
    'channel.comments.total': 0,
    'channel.subscribers.latest': 0,
    'channel.videos.latest': 0,
    'channel.watch_time_minutes.total': 0,
    'channel.avg_views_per_video': 0,
    'channel.engagement_rate': 0,
    'channel.views.timeseries': 0,
    'channel.subscribers.timeseries': 0,
    'channel.likes.timeseries': 0,
    'channel.comments.timeseries': 0,
    'ml.anomalies.count': 0,
    'ml.anomalies.critical_count': 0,
    'ml.forecast.points_count': 0,
    'ml.models.active_count': 0,
    'content.documents.count': 0,
    'video.views.max': 0,
    'channel.snapshot.views': 0,
    'channel.snapshot.subscribers': 0,
  };

  for (const dependencyId of definition.dependencies) {
    const dependencyResult = resolveMetricValue(
      db,
      {
        metricId: dependencyId,
        channelId: input.channelId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      },
      cache,
      visiting,
    );
    if (!dependencyResult.ok) {
      visiting.delete(input.metricId);
      return dependencyResult;
    }
    dependencyValues[dependencyId] = dependencyResult.value;
  }

  visiting.delete(input.metricId);
  const value = definition.compute(dependencyValues);
  cache.set(input.metricId, value);
  return ok(value);
}

export function createSemanticMetricService(db: Database.Database): SemanticMetricService {
  return {
    listMetricDefinitions: () => METRIC_CATALOG,

    readMetricValue: (input) => {
      const rangeValidation = validateDateRange(input.dateFrom, input.dateTo);
      if (!rangeValidation.ok) {
        return rangeValidation;
      }

      return resolveMetricValue(
        db,
        input,
        new Map<SemanticMetricId, number>(),
        new Set<SemanticMetricId>(),
      );
    },

    readMetricValues: (input) => {
      const rangeValidation = validateDateRange(input.dateFrom, input.dateTo);
      if (!rangeValidation.ok) {
        return rangeValidation;
      }

      const cache = new Map<SemanticMetricId, number>();
      const values: Record<SemanticMetricId, number> = {
        'channel.views.total': 0,
        'channel.likes.total': 0,
        'channel.comments.total': 0,
        'channel.subscribers.latest': 0,
        'channel.videos.latest': 0,
        'channel.watch_time_minutes.total': 0,
        'channel.avg_views_per_video': 0,
        'channel.engagement_rate': 0,
        'channel.views.timeseries': 0,
        'channel.subscribers.timeseries': 0,
        'channel.likes.timeseries': 0,
        'channel.comments.timeseries': 0,
        'ml.anomalies.count': 0,
        'ml.anomalies.critical_count': 0,
        'ml.forecast.points_count': 0,
        'ml.models.active_count': 0,
        'content.documents.count': 0,
        'video.views.max': 0,
        'channel.snapshot.views': 0,
        'channel.snapshot.subscribers': 0,
      };

      for (const metricId of input.metricIds) {
        const valueResult = resolveMetricValue(
          db,
          {
            metricId,
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
          },
          cache,
          new Set<SemanticMetricId>(),
        );
        if (!valueResult.ok) {
          return valueResult;
        }
        values[metricId] = valueResult.value;
      }

      return ok(values);
    },

    readTimeseries: (input) => {
      const rangeValidation = validateDateRange(input.dateFrom, input.dateTo);
      if (!rangeValidation.ok) {
        return rangeValidation;
      }

      const column = TIMESERIES_METRIC_MAP[input.metric];
      const bucketExpression = createTimeseriesBucketExpression(input.granularity);
      const aggregationExpression = createTimeseriesAggregationExpression(input.metric, column);

      const sql = `
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
          .prepare<{ channelId: string; dateFrom: string; dateTo: string }, { pointDate: string; value: number }>(
            sql,
          )
          .all({
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
          });

        return ok({
          metric: input.metric,
          granularity: input.granularity,
          points: rows.map((row) => ({
            date: row.pointDate,
            value: row.value,
          })),
        });
      } catch (cause) {
        return err(
          AppError.create(
            'SEMANTIC_METRIC_TIMESERIES_FAILED',
            'Failed to read time series from semantic layer.',
            'error',
            {
              channelId: input.channelId,
              metric: input.metric,
              dateFrom: input.dateFrom,
              dateTo: input.dateTo,
              granularity: input.granularity,
            },
            toError(cause),
          ),
        );
      }
    },
  };
}

export function getSemanticMetricCatalog(): readonly SemanticMetricDefinition[] {
  return METRIC_CATALOG;
}
