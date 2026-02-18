import {
  createQualityQueries,
  createQualityRepository,
  type DatabaseConnection,
} from '@moze/core';
import { AppError, err, ok, type QualityScoreConfidence, type QualityScoreResultDTO, type Result } from '@moze/shared';
import { z } from 'zod/v4';

const QUALITY_SCORE_WEIGHTS = {
  velocity: 0.25,
  efficiency: 0.2,
  engagement: 0.25,
  retention: 0.15,
  consistency: 0.15,
} as const;

type ScoreComponentKey = keyof typeof QUALITY_SCORE_WEIGHTS;

interface VideoAggregateRow {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: string;
  durationSeconds: number;
  activeDays: number;
  viewsSum: number;
  likesSum: number;
  commentsSum: number;
  watchTimeMinutesSum: number;
  viewsAvg: number;
  viewsSquaredAvg: number;
}

interface RawQualityComponents {
  velocity: number;
  efficiency: number;
  engagement: number;
  retention: number;
  consistency: number;
}

export interface GetQualityScoresInput {
  db: DatabaseConnection['db'];
  channelId: string;
  dateFrom: string;
  dateTo: string;
  limit?: number;
  now?: () => Date;
}

const VIDEO_AGGREGATE_ROW_SCHEMA = z.object({
  videoId: z.string().min(1),
  channelId: z.string().min(1),
  title: z.string().min(1),
  publishedAt: z.iso.datetime(),
  durationSeconds: z.number().int().nonnegative(),
  activeDays: z.number().int().positive(),
  viewsSum: z.number().nonnegative(),
  likesSum: z.number().nonnegative(),
  commentsSum: z.number().nonnegative(),
  watchTimeMinutesSum: z.number().nonnegative(),
  viewsAvg: z.number().nonnegative(),
  viewsSquaredAvg: z.number().nonnegative(),
});

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function createQualityScoringError(
  code: string,
  message: string,
  context: Record<string, unknown>,
  cause?: unknown,
): AppError {
  return AppError.create(code, message, 'error', context, cause ? toError(cause) : undefined);
}

function round(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 1_000_000) / 1_000_000;
}

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.min(maxValue, Math.max(minValue, value));
}

function toConfidence(daysWithData: number): QualityScoreConfidence {
  if (daysWithData > 60) {
    return 'high';
  }
  if (daysWithData >= 30) {
    return 'medium';
  }
  return 'low';
}

function validateDateRange(dateFrom: string, dateTo: string): Result<void, AppError> {
  if (dateFrom > dateTo) {
    return err(
      createQualityScoringError(
        'QUALITY_SCORING_INVALID_DATE_RANGE',
        'Data poczatkowa nie moze byc pozniejsza niz koncowa.',
        { dateFrom, dateTo },
      ),
    );
  }
  return ok(undefined);
}

function readAverageSubscribers(
  db: DatabaseConnection['db'],
  channelId: string,
  dateFrom: string,
  dateTo: string,
): Result<number, AppError> {
  const qualityQueries = createQualityQueries(db);

  const averageResult = qualityQueries.getAverageSubscribersInRange({
    channelId,
    dateFrom,
    dateTo,
  });
  if (!averageResult.ok) {
    return err(
      createQualityScoringError(
        'QUALITY_SCORING_SUBSCRIBERS_READ_FAILED',
        'Nie udalo sie odczytac liczby subskrybentow do quality scoring.',
        { channelId, dateFrom, dateTo, causeErrorCode: averageResult.error.code },
        averageResult.error,
      ),
    );
  }

  if (typeof averageResult.value === 'number' && Number.isFinite(averageResult.value)) {
    return ok(Math.max(1, averageResult.value));
  }

  const fallbackResult = qualityQueries.getChannelSubscriberCount({ channelId });
  if (!fallbackResult.ok) {
    return err(
      createQualityScoringError(
        'QUALITY_SCORING_SUBSCRIBERS_READ_FAILED',
        'Nie udalo sie odczytac liczby subskrybentow do quality scoring.',
        { channelId, dateFrom, dateTo, causeErrorCode: fallbackResult.error.code },
        fallbackResult.error,
      ),
    );
  }

  return ok(Math.max(1, fallbackResult.value ?? 1));
}

function readVideoAggregates(
  db: DatabaseConnection['db'],
  channelId: string,
  dateFrom: string,
  dateTo: string,
): Result<VideoAggregateRow[], AppError> {
  const qualityQueries = createQualityQueries(db);
  const rowsResult = qualityQueries.listVideoAggregates({ channelId, dateFrom, dateTo });
  if (!rowsResult.ok) {
    return err(
      createQualityScoringError(
        'QUALITY_SCORING_READ_FAILED',
        'Nie udalo sie odczytac danych do quality scoring.',
        { channelId, dateFrom, dateTo, causeErrorCode: rowsResult.error.code },
        rowsResult.error,
      ),
    );
  }

  const result: VideoAggregateRow[] = [];
  for (let index = 0; index < rowsResult.value.length; index += 1) {
    const parsed = VIDEO_AGGREGATE_ROW_SCHEMA.safeParse(rowsResult.value[index]);
    if (!parsed.success) {
      return err(
        createQualityScoringError(
          'QUALITY_SCORING_INVALID_ROW',
          'Dane quality scoring maja niepoprawny format.',
          { channelId, dateFrom, dateTo, rowIndex: index, issues: parsed.error.issues },
        ),
      );
    }
    result.push(parsed.data);
  }

  return ok(result);
}

function computeRawComponents(row: VideoAggregateRow, averageSubscribers: number): RawQualityComponents {
  const meanViews = Math.max(row.viewsAvg, 0);
  const variance = Math.max(0, row.viewsSquaredAvg - meanViews * meanViews);
  const stdDeviation = Math.sqrt(variance);
  const coefficientOfVariation = meanViews > 0 ? stdDeviation / meanViews : 1;

  const avgWatchSecondsPerView = row.viewsSum > 0
    ? (row.watchTimeMinutesSum * 60) / row.viewsSum
    : 0;
  const retentionRaw = row.durationSeconds > 0
    ? clamp(avgWatchSecondsPerView / row.durationSeconds, 0, 1)
    : 0;

  return {
    velocity: row.activeDays > 0 ? row.viewsSum / row.activeDays : 0,
    efficiency: row.viewsSum / Math.max(averageSubscribers, 1),
    engagement: row.viewsSum > 0 ? (row.likesSum + row.commentsSum * 3) / row.viewsSum : 0,
    retention: retentionRaw,
    consistency: Math.max(0, 1 - coefficientOfVariation),
  };
}

function calculatePercentile(value: number, values: readonly number[]): number {
  if (values.length <= 1) {
    return 1;
  }

  let lessOrEqual = 0;
  for (const sample of values) {
    if (sample <= value) {
      lessOrEqual += 1;
    }
  }

  return clamp((lessOrEqual - 1) / (values.length - 1), 0, 1);
}

function persistQualityScores(
  input: {
    db: DatabaseConnection['db'];
    channelId: string;
    dateFrom: string;
    dateTo: string;
    calculatedAt: string;
    items: QualityScoreResultDTO['items'];
  },
): Result<void, AppError> {
  const qualityRepository = createQualityRepository(input.db);
  const persistResult = qualityRepository.runInTransaction(() => {
    const deleteResult = qualityRepository.deleteScoresWindow({
      channelId: input.channelId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });
    if (!deleteResult.ok) {
      return deleteResult;
    }

    for (const item of input.items) {
      const insertResult = qualityRepository.insertScore({
        channelId: input.channelId,
        videoId: item.videoId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        score: item.score,
        velocityScore: item.components.velocity,
        efficiencyScore: item.components.efficiency,
        engagementScore: item.components.engagement,
        retentionScore: item.components.retention,
        consistencyScore: item.components.consistency,
        confidence: item.confidence,
        activeDays: item.daysWithData,
        componentsJson: JSON.stringify({
          normalized: item.components,
          raw: item.rawComponents,
          weights: QUALITY_SCORE_WEIGHTS,
        }),
        calculatedAt: input.calculatedAt,
      });
      if (!insertResult.ok) {
        return insertResult;
      }
    }

    return ok(undefined);
  });

  if (!persistResult.ok) {
    return err(
      createQualityScoringError(
        'QUALITY_SCORING_PERSIST_FAILED',
        'Nie udalo sie zapisac quality scoring do bazy danych.',
        {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          items: input.items.length,
          causeErrorCode: persistResult.error.code,
        },
        persistResult.error,
      ),
    );
  }

  return ok(undefined);
}

export function getQualityScores(input: GetQualityScoresInput): Result<QualityScoreResultDTO, AppError> {
  const now = input.now ?? (() => new Date());
  const calculatedAt = now().toISOString();
  const limit = input.limit ?? 20;

  const rangeValidationResult = validateDateRange(input.dateFrom, input.dateTo);
  if (!rangeValidationResult.ok) {
    return rangeValidationResult;
  }

  const avgSubscribersResult = readAverageSubscribers(input.db, input.channelId, input.dateFrom, input.dateTo);
  if (!avgSubscribersResult.ok) {
    return avgSubscribersResult;
  }

  const aggregateResult = readVideoAggregates(input.db, input.channelId, input.dateFrom, input.dateTo);
  if (!aggregateResult.ok) {
    return aggregateResult;
  }

  const aggregateRows = aggregateResult.value;
  if (aggregateRows.length === 0) {
    const persistEmptyResult = persistQualityScores({
      db: input.db,
      channelId: input.channelId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      calculatedAt,
      items: [],
    });
    if (!persistEmptyResult.ok) {
      return persistEmptyResult;
    }

    return ok({
      channelId: input.channelId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      total: 0,
      calculatedAt,
      items: [],
    });
  }

  const rowsWithRaw = aggregateRows.map((row) => ({
    row,
    raw: computeRawComponents(row, avgSubscribersResult.value),
  }));

  const rawValuesByComponent: Record<ScoreComponentKey, number[]> = {
    velocity: rowsWithRaw.map((entry) => entry.raw.velocity),
    efficiency: rowsWithRaw.map((entry) => entry.raw.efficiency),
    engagement: rowsWithRaw.map((entry) => entry.raw.engagement),
    retention: rowsWithRaw.map((entry) => entry.raw.retention),
    consistency: rowsWithRaw.map((entry) => entry.raw.consistency),
  };

  const items: QualityScoreResultDTO['items'] = rowsWithRaw.map((entry) => {
    const components = {
      velocity: round(calculatePercentile(entry.raw.velocity, rawValuesByComponent.velocity)),
      efficiency: round(calculatePercentile(entry.raw.efficiency, rawValuesByComponent.efficiency)),
      engagement: round(calculatePercentile(entry.raw.engagement, rawValuesByComponent.engagement)),
      retention: round(calculatePercentile(entry.raw.retention, rawValuesByComponent.retention)),
      consistency: round(calculatePercentile(entry.raw.consistency, rawValuesByComponent.consistency)),
    };

    const score01 = (components.velocity * QUALITY_SCORE_WEIGHTS.velocity)
      + (components.efficiency * QUALITY_SCORE_WEIGHTS.efficiency)
      + (components.engagement * QUALITY_SCORE_WEIGHTS.engagement)
      + (components.retention * QUALITY_SCORE_WEIGHTS.retention)
      + (components.consistency * QUALITY_SCORE_WEIGHTS.consistency);

    return {
      videoId: entry.row.videoId,
      channelId: entry.row.channelId,
      title: entry.row.title,
      publishedAt: entry.row.publishedAt,
      score: round(score01 * 100),
      confidence: toConfidence(entry.row.activeDays),
      daysWithData: entry.row.activeDays,
      components,
      rawComponents: {
        velocity: round(entry.raw.velocity),
        efficiency: round(entry.raw.efficiency),
        engagement: round(entry.raw.engagement),
        retention: round(entry.raw.retention),
        consistency: round(entry.raw.consistency),
      },
      calculatedAt,
    };
  }).sort((a, b) =>
    b.score - a.score
    || b.daysWithData - a.daysWithData
    || a.videoId.localeCompare(b.videoId));

  const persistResult = persistQualityScores({
    db: input.db,
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    calculatedAt,
    items,
  });
  if (!persistResult.ok) {
    return persistResult;
  }

  return ok({
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    total: items.length,
    calculatedAt,
    items: items.slice(0, limit),
  });
}
