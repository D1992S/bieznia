import type Database from 'better-sqlite3';
import { AppError, err, ok, type TopicConfidence, type TopicTrendDirection, type Result } from '@moze/shared';

export interface TopicRepository {
  deleteGapsWindow: (input: { channelId: string; dateFrom: string; dateTo: string }) => Result<void, AppError>;
  deletePressureWindow: (input: { channelId: string; dateFrom: string; dateTo: string }) => Result<void, AppError>;
  upsertCluster: (input: {
    channelId: string;
    clusterId: string;
    label: string;
    keywordsJson: string;
    sampleSize: number;
    nowIso: string;
  }) => Result<void, AppError>;
  insertGap: (input: {
    channelId: string;
    clusterId: string;
    dateFrom: string;
    dateTo: string;
    ownerCoverage: number;
    nichePressure: number;
    gapScore: number;
    cannibalizationRisk: number;
    trendDirection: TopicTrendDirection;
    confidence: TopicConfidence;
    rationale: string;
    calculatedAt: string;
  }) => Result<void, AppError>;
  upsertPressure: (input: {
    channelId: string;
    clusterId: string;
    date: string;
    ownerViews: number;
    competitorViews: number;
    pressureScore: number;
    trendDirection: TopicTrendDirection;
    updatedAt: string;
  }) => Result<void, AppError>;
  runInTransaction: <T>(operation: () => Result<T, AppError>) => Result<T, AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

export function createTopicRepository(db: Database.Database): TopicRepository {
  const deleteGapsStmt = db.prepare<{ channelId: string; dateFrom: string; dateTo: string }>(
    `
      DELETE FROM agg_topic_gaps
      WHERE channel_id = @channelId
        AND date_from = @dateFrom
        AND date_to = @dateTo
    `,
  );

  const deletePressureStmt = db.prepare<{ channelId: string; dateFrom: string; dateTo: string }>(
    `
      DELETE FROM fact_topic_pressure_day
      WHERE channel_id = @channelId
        AND date BETWEEN @dateFrom AND @dateTo
    `,
  );

  const upsertClusterStmt = db.prepare<{
    channelId: string;
    clusterId: string;
    label: string;
    keywordsJson: string;
    sampleSize: number;
    nowIso: string;
  }>(
    `
      INSERT INTO dim_topic_cluster (channel_id, cluster_id, label, keywords_json, sample_size, created_at, updated_at)
      VALUES (@channelId, @clusterId, @label, @keywordsJson, @sampleSize, @nowIso, @nowIso)
      ON CONFLICT(channel_id, cluster_id)
      DO UPDATE SET
        label = excluded.label,
        keywords_json = excluded.keywords_json,
        sample_size = excluded.sample_size,
        updated_at = excluded.updated_at
    `,
  );

  const insertGapStmt = db.prepare<{
    channelId: string;
    clusterId: string;
    dateFrom: string;
    dateTo: string;
    ownerCoverage: number;
    nichePressure: number;
    gapScore: number;
    cannibalizationRisk: number;
    trendDirection: TopicTrendDirection;
    confidence: TopicConfidence;
    rationale: string;
    calculatedAt: string;
  }>(
    `
      INSERT INTO agg_topic_gaps (
        channel_id, cluster_id, date_from, date_to, owner_coverage, niche_pressure, gap_score,
        cannibalization_risk, trend_direction, confidence, rationale, calculated_at
      )
      VALUES (
        @channelId, @clusterId, @dateFrom, @dateTo, @ownerCoverage, @nichePressure, @gapScore,
        @cannibalizationRisk, @trendDirection, @confidence, @rationale, @calculatedAt
      )
    `,
  );

  const upsertPressureStmt = db.prepare<{
    channelId: string;
    clusterId: string;
    date: string;
    ownerViews: number;
    competitorViews: number;
    pressureScore: number;
    trendDirection: TopicTrendDirection;
    updatedAt: string;
  }>(
    `
      INSERT INTO fact_topic_pressure_day (
        channel_id, cluster_id, date, owner_views, competitor_views, pressure_score, trend_direction, updated_at
      )
      VALUES (
        @channelId, @clusterId, @date, @ownerViews, @competitorViews, @pressureScore, @trendDirection, @updatedAt
      )
      ON CONFLICT(channel_id, cluster_id, date)
      DO UPDATE SET
        owner_views = excluded.owner_views,
        competitor_views = excluded.competitor_views,
        pressure_score = excluded.pressure_score,
        trend_direction = excluded.trend_direction,
        updated_at = excluded.updated_at
    `,
  );

  return {
    deleteGapsWindow: (input) => {
      try {
        deleteGapsStmt.run({
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_TOPIC_GAPS_DELETE_FAILED',
            'Failed to delete persisted topic gaps.',
            'error',
            { channelId: input.channelId, dateFrom: input.dateFrom, dateTo: input.dateTo },
            toError(cause),
          ),
        );
      }
    },

    deletePressureWindow: (input) => {
      try {
        deletePressureStmt.run({
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_TOPIC_PRESSURE_DELETE_FAILED',
            'Failed to delete persisted topic pressure.',
            'error',
            { channelId: input.channelId, dateFrom: input.dateFrom, dateTo: input.dateTo },
            toError(cause),
          ),
        );
      }
    },

    upsertCluster: (input) => {
      try {
        upsertClusterStmt.run({
          channelId: input.channelId,
          clusterId: input.clusterId,
          label: input.label,
          keywordsJson: input.keywordsJson,
          sampleSize: input.sampleSize,
          nowIso: input.nowIso,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_TOPIC_CLUSTER_UPSERT_FAILED',
            'Failed to save topic cluster.',
            'error',
            { channelId: input.channelId, clusterId: input.clusterId },
            toError(cause),
          ),
        );
      }
    },

    insertGap: (input) => {
      try {
        insertGapStmt.run({
          channelId: input.channelId,
          clusterId: input.clusterId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          ownerCoverage: input.ownerCoverage,
          nichePressure: input.nichePressure,
          gapScore: input.gapScore,
          cannibalizationRisk: input.cannibalizationRisk,
          trendDirection: input.trendDirection,
          confidence: input.confidence,
          rationale: input.rationale,
          calculatedAt: input.calculatedAt,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_TOPIC_GAP_INSERT_FAILED',
            'Failed to save topic gap.',
            'error',
            { channelId: input.channelId, clusterId: input.clusterId, dateFrom: input.dateFrom, dateTo: input.dateTo },
            toError(cause),
          ),
        );
      }
    },

    upsertPressure: (input) => {
      try {
        upsertPressureStmt.run({
          channelId: input.channelId,
          clusterId: input.clusterId,
          date: input.date,
          ownerViews: input.ownerViews,
          competitorViews: input.competitorViews,
          pressureScore: input.pressureScore,
          trendDirection: input.trendDirection,
          updatedAt: input.updatedAt,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_TOPIC_PRESSURE_UPSERT_FAILED',
            'Failed to save topic pressure.',
            'error',
            { channelId: input.channelId, clusterId: input.clusterId, date: input.date },
            toError(cause),
          ),
        );
      }
    },

    runInTransaction: <T>(operation: () => Result<T, AppError>) => {
      const transactionErrorRef: { current: AppError | null } = { current: null };
      try {
        const transaction = db.transaction(() => {
          const result = operation();
          if (!result.ok) {
            transactionErrorRef.current = result.error;
            throw new Error(result.error.message);
          }
          return result.value;
        });
        return ok(transaction());
      } catch (cause) {
        if (transactionErrorRef.current !== null) {
          return err(transactionErrorRef.current);
        }
        return err(
          AppError.create(
            'DB_TOPIC_TRANSACTION_FAILED',
            'Failed to execute topic transaction.',
            'error',
            {},
            toError(cause),
          ),
        );
      }
    },
  };
}
