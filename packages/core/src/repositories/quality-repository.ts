import type Database from 'better-sqlite3';
import { AppError, err, ok, type QualityScoreConfidence, type Result } from '@moze/shared';

export interface QualityRepository {
  deleteScoresWindow: (input: { channelId: string; dateFrom: string; dateTo: string }) => Result<void, AppError>;
  insertScore: (input: {
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
  }) => Result<void, AppError>;
  runInTransaction: <T>(operation: () => Result<T, AppError>) => Result<T, AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

export function createQualityRepository(db: Database.Database): QualityRepository {
  const deleteStmt = db.prepare<{
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

  const insertStmt = db.prepare<{
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

  return {
    deleteScoresWindow: (input) => {
      try {
        deleteStmt.run({
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_QUALITY_SCORES_DELETE_FAILED',
            'Failed to delete previous quality scoring results.',
            'error',
            { channelId: input.channelId, dateFrom: input.dateFrom, dateTo: input.dateTo },
            toError(cause),
          ),
        );
      }
    },

    insertScore: (input) => {
      try {
        insertStmt.run({
          channelId: input.channelId,
          videoId: input.videoId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          score: input.score,
          velocityScore: input.velocityScore,
          efficiencyScore: input.efficiencyScore,
          engagementScore: input.engagementScore,
          retentionScore: input.retentionScore,
          consistencyScore: input.consistencyScore,
          confidence: input.confidence,
          activeDays: input.activeDays,
          componentsJson: input.componentsJson,
          calculatedAt: input.calculatedAt,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_QUALITY_SCORE_INSERT_FAILED',
            'Failed to save quality scoring result.',
            'error',
            { channelId: input.channelId, videoId: input.videoId, dateFrom: input.dateFrom, dateTo: input.dateTo },
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
            'DB_QUALITY_TRANSACTION_FAILED',
            'Failed to execute quality scoring transaction.',
            'error',
            {},
            toError(cause),
          ),
        );
      }
    },
  };
}
