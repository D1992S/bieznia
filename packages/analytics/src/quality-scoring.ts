import type { DatabaseConnection } from '@moze/core';
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
  try {
    const rangeRow = db.prepare<
      { channelId: string; dateFrom: string; dateTo: string },
      { avgSubscribers: number | null }
    >(
      `
        SELECT AVG(subscribers) AS avgSubscribers
        FROM fact_channel_day
        WHERE channel_id = @channelId
          AND date BETWEEN @dateFrom AND @dateTo
        ORDER BY date ASC
      `,
    ).get({ channelId, dateFrom, dateTo });

    if (typeof rangeRow?.avgSubscribers === 'number' && Number.isFinite(rangeRow.avgSubscribers)) {
      return ok(Math.max(1, rangeRow.avgSubscribers));
    }

    const fallbackRow = db.prepare<{ channelId: string }, { subscriberCount: number }>(
      `
        SELECT subscriber_count AS subscriberCount
        FROM dim_channel
        WHERE channel_id = @channelId
        ORDER BY channel_id ASC
        LIMIT 1
      `,
    ).get({ channelId });

    return ok(Math.max(1, fallbackRow?.subscriberCount ?? 1));
  } catch (cause) {
    return err(
      createQualityScoringError(
        'QUALITY_SCORING_SUBSCRIBERS_READ_FAILED',
        'Nie udalo sie odczytac liczby subskrybentow do quality scoring.',
        { channelId, dateFrom, dateTo },
        cause,
      ),
    );
  }
}

function readVideoAggregates(
  db: DatabaseConnection['db'],
  channelId: string,
  dateFrom: string,
  dateTo: string,
): Result<VideoAggregateRow[], AppError> {
  const sql = `
    SELECT
      v.video_id AS videoId,
      v.channel_id AS channelId,
      v.title AS title,
      v.published_at AS publishedAt,
      COALESCE(v.duration_seconds, 0) AS durationSeconds,
      COUNT(*) AS activeDays,
      SUM(f.views) AS viewsSum,
      SUM(f.likes) AS likesSum,
      SUM(f.comments) AS commentsSum,
      SUM(COALESCE(f.watch_time_minutes, 0)) AS watchTimeMinutesSum,
      AVG(f.views) AS viewsAvg,
      AVG(CAST(f.views AS REAL) * CAST(f.views AS REAL)) AS viewsSquaredAvg
    FROM fact_video_day AS f
    INNER JOIN dim_video AS v
      ON v.video_id = f.video_id
    WHERE f.channel_id = @channelId
      AND f.date BETWEEN @dateFrom AND @dateTo
    GROUP BY v.video_id, v.channel_id, v.title, v.published_at, v.duration_seconds
    ORDER BY v.video_id ASC
  `;

  try {
    const rows = db.prepare<
      { channelId: string; dateFrom: string; dateTo: string },
      VideoAggregateRow
    >(sql).all({ channelId, dateFrom, dateTo });

    const result: VideoAggregateRow[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const parsed = VIDEO_AGGREGATE_ROW_SCHEMA.safeParse(rows[index]);
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
  } catch (cause) {
    return err(
      createQualityScoringError(
        'QUALITY_SCORING_READ_FAILED',
        'Nie udalo sie odczytac danych do quality scoring.',
        { channelId, dateFrom, dateTo },
        cause,
      ),
    );
  }
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
  const deleteStmt = input.db.prepare<{
    channelId: string;
    dateFrom: string;
    dateTo: string;
  }>(
    `
      DELETE FROM agg_quality_scores
      WHERE channel_id = @channelId
        AND date_from = @dateFrom
        AND date_to = @dateTo
    `,
  );

  const insertStmt = input.db.prepare<{
    channelId: string;
    videoId: string;
    dateFrom: string;
    dateTo: string;
    score: number;
    velocityScore: number;
    efficiencyScore: number;
    engagementScore: number;
    retentionScore: number;
    consistencyScore: number;
    confidence: QualityScoreConfidence;
    activeDays: number;
    componentsJson: string;
    calculatedAt: string;
  }>(
    `
      INSERT INTO agg_quality_scores (
        channel_id,
        video_id,
        date_from,
        date_to,
        score,
        velocity_score,
        efficiency_score,
        engagement_score,
        retention_score,
        consistency_score,
        confidence,
        active_days,
        components_json,
        calculated_at
      )
      VALUES (
        @channelId,
        @videoId,
        @dateFrom,
        @dateTo,
        @score,
        @velocityScore,
        @efficiencyScore,
        @engagementScore,
        @retentionScore,
        @consistencyScore,
        @confidence,
        @activeDays,
        @componentsJson,
        @calculatedAt
      )
    `,
  );

  try {
    const tx = input.db.transaction(() => {
      deleteStmt.run({
        channelId: input.channelId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      });

      for (const item of input.items) {
        insertStmt.run({
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
      }
    });

    tx();
    return ok(undefined);
  } catch (cause) {
    return err(
      createQualityScoringError(
        'QUALITY_SCORING_PERSIST_FAILED',
        'Nie udalo sie zapisac quality scoring do bazy danych.',
        {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          items: input.items.length,
        },
        cause,
      ),
    );
  }
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
