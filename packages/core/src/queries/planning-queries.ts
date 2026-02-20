import type Database from 'better-sqlite3';
import { AppError, err, ok, type PlanningConfidence, type Result } from '@moze/shared';

export interface PlanningPlanHeaderRow {
  planId: string;
  channelId: string;
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
}

export interface PlanningRecommendationRow {
  recommendationId: string;
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
}

export interface PlanningQueries {
  getLatestPlanHeader: (input: {
    channelId: string;
    dateFrom: string;
    dateTo: string;
  }) => Result<PlanningPlanHeaderRow | null, AppError>;
  listRecommendationsByPlanId: (input: { planId: string }) => Result<PlanningRecommendationRow[], AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

export function createPlanningQueries(db: Database.Database): PlanningQueries {
  const getPlanHeaderStmt = db.prepare<
    { channelId: string; dateFrom: string; dateTo: string },
    PlanningPlanHeaderRow
  >(
    `
      SELECT
        plan_id AS planId,
        channel_id AS channelId,
        date_from AS dateFrom,
        date_to AS dateTo,
        generated_at AS generatedAt
      FROM planning_plans
      WHERE channel_id = @channelId
        AND date_from = @dateFrom
        AND date_to = @dateTo
      ORDER BY generated_at DESC, plan_id ASC
      LIMIT 1
    `,
  );

  const listRecommendationsStmt = db.prepare<{ planId: string }, PlanningRecommendationRow>(
    `
      SELECT
        recommendation_id AS recommendationId,
        slot_date AS slotDate,
        slot_order AS slotOrder,
        topic_cluster_id AS topicClusterId,
        topic_label AS topicLabel,
        suggested_title AS suggestedTitle,
        priority_score AS priorityScore,
        confidence AS confidence,
        rationale AS rationale,
        evidence_json AS evidenceJson,
        warnings_json AS warningsJson
      FROM planning_recommendations
      WHERE plan_id = @planId
      ORDER BY slot_order ASC, slot_date ASC, recommendation_id ASC
    `,
  );

  return {
    getLatestPlanHeader: (input) => {
      try {
        return ok(
          getPlanHeaderStmt.get({
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
          }) ?? null,
        );
      } catch (cause) {
        return err(
          AppError.create(
            'DB_PLANNING_PLAN_READ_FAILED',
            'Nie udalo sie odczytac naglowka planu.',
            'error',
            { channelId: input.channelId, dateFrom: input.dateFrom, dateTo: input.dateTo },
            toError(cause),
          ),
        );
      }
    },

    listRecommendationsByPlanId: (input) => {
      try {
        return ok(listRecommendationsStmt.all({ planId: input.planId }));
      } catch (cause) {
        return err(
          AppError.create(
            'DB_PLANNING_RECOMMENDATIONS_READ_FAILED',
            'Nie udalo sie odczytac rekomendacji planu.',
            'error',
            { planId: input.planId },
            toError(cause),
          ),
        );
      }
    },
  };
}
