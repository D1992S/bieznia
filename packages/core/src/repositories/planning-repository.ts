import type Database from 'better-sqlite3';
import { AppError, err, ok, type PlanningConfidence, type Result } from '@moze/shared';

export interface PlanningRepository {
  deletePlansWindow: (input: { channelId: string; dateFrom: string; dateTo: string }) => Result<void, AppError>;
  insertPlan: (input: {
    planId: string;
    channelId: string;
    dateFrom: string;
    dateTo: string;
    generatedAt: string;
    algorithmVersion: string;
    recommendationsCount: number;
  }) => Result<void, AppError>;
  insertRecommendation: (input: {
    recommendationId: string;
    planId: string;
    channelId: string;
    slotDate: string;
    slotOrder: number;
    topicClusterId: string;
    topicLabel: string;
    suggestedTitle: string;
    priorityScore: number;
    confidence: PlanningConfidence;
    rationale: string;
    evidenceJson: string;
    warningsJson: string;
    createdAt: string;
  }) => Result<void, AppError>;
  runInTransaction: <T>(operation: () => Result<T, AppError>) => Result<T, AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

export function createPlanningRepository(db: Database.Database): PlanningRepository {
  const deletePlansStmt = db.prepare<{ channelId: string; dateFrom: string; dateTo: string }>(
    `
      DELETE FROM planning_plans
      WHERE channel_id = @channelId
        AND date_from = @dateFrom
        AND date_to = @dateTo
    `,
  );

  const insertPlanStmt = db.prepare<{
    planId: string;
    channelId: string;
    dateFrom: string;
    dateTo: string;
    generatedAt: string;
    algorithmVersion: string;
    recommendationsCount: number;
  }>(
    `
      INSERT INTO planning_plans (
        plan_id, channel_id, date_from, date_to, algorithm_version, generated_at, recommendations_count
      )
      VALUES (
        @planId, @channelId, @dateFrom, @dateTo, @algorithmVersion, @generatedAt, @recommendationsCount
      )
    `,
  );

  const insertRecommendationStmt = db.prepare<{
    recommendationId: string;
    planId: string;
    channelId: string;
    slotDate: string;
    slotOrder: number;
    topicClusterId: string;
    topicLabel: string;
    suggestedTitle: string;
    priorityScore: number;
    confidence: PlanningConfidence;
    rationale: string;
    evidenceJson: string;
    warningsJson: string;
    createdAt: string;
  }>(
    `
      INSERT INTO planning_recommendations (
        recommendation_id, plan_id, channel_id, slot_date, slot_order, topic_cluster_id, topic_label,
        suggested_title, priority_score, confidence, rationale, evidence_json, warnings_json, created_at
      )
      VALUES (
        @recommendationId, @planId, @channelId, @slotDate, @slotOrder, @topicClusterId, @topicLabel,
        @suggestedTitle, @priorityScore, @confidence, @rationale, @evidenceJson, @warningsJson, @createdAt
      )
    `,
  );

  return {
    deletePlansWindow: (input) => {
      try {
        deletePlansStmt.run({
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_PLANNING_PLAN_DELETE_FAILED',
            'Failed to delete previous plans.',
            'error',
            { channelId: input.channelId, dateFrom: input.dateFrom, dateTo: input.dateTo },
            toError(cause),
          ),
        );
      }
    },

    insertPlan: (input) => {
      try {
        insertPlanStmt.run({
          planId: input.planId,
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          generatedAt: input.generatedAt,
          algorithmVersion: input.algorithmVersion,
          recommendationsCount: input.recommendationsCount,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_PLANNING_PLAN_INSERT_FAILED',
            'Failed to save plan.',
            'error',
            { planId: input.planId, channelId: input.channelId },
            toError(cause),
          ),
        );
      }
    },

    insertRecommendation: (input) => {
      try {
        insertRecommendationStmt.run({
          recommendationId: input.recommendationId,
          planId: input.planId,
          channelId: input.channelId,
          slotDate: input.slotDate,
          slotOrder: input.slotOrder,
          topicClusterId: input.topicClusterId,
          topicLabel: input.topicLabel,
          suggestedTitle: input.suggestedTitle,
          priorityScore: input.priorityScore,
          confidence: input.confidence,
          rationale: input.rationale,
          evidenceJson: input.evidenceJson,
          warningsJson: input.warningsJson,
          createdAt: input.createdAt,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_PLANNING_RECOMMENDATION_INSERT_FAILED',
            'Failed to save planning recommendation.',
            'error',
            { planId: input.planId, recommendationId: input.recommendationId },
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
            'DB_PLANNING_TRANSACTION_FAILED',
            'Failed to execute planning transaction.',
            'error',
            {},
            toError(cause),
          ),
        );
      }
    },
  };
}
