import {
  createPlanningQueries,
  createPlanningRepository,
  type DatabaseConnection,
} from '@moze/core';
import {
  AppError,
  type CompetitorInsightsResultDTO,
  err,
  ok,
  type PlanningConfidence,
  type PlanningEvidenceItemDTO,
  type PlanningPlanResultDTO,
  type PlanningRecommendationItemDTO,
  type QualityScoreResultDTO,
  type Result,
  type TopicIntelligenceResultDTO,
} from '@moze/shared';
import { z } from 'zod/v4';
import { getCompetitorInsights } from './competitor-intelligence.ts';
import { getQualityScores } from './quality-scoring.ts';
import { runTopicIntelligence } from './topic-intelligence.ts';

const ALGORITHM_VERSION = 'planning-system-v1';

interface PersistedPlanRow {
  planId: string;
  channelId: string;
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
}

interface PersistedRecommendationRow {
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

interface PlanningCandidate {
  topicClusterId: string;
  topicLabel: string;
  suggestedTitle: string;
  priorityScore: number;
  confidence: PlanningConfidence;
  rationale: string;
  evidence: PlanningEvidenceItemDTO[];
  warnings: string[];
  cannibalizationRisk: number;
}

export interface GeneratePlanningPlanInput {
  db: DatabaseConnection['db'];
  channelId: string;
  dateFrom: string;
  dateTo: string;
  maxRecommendations?: number;
  clusterLimit?: number;
  gapLimit?: number;
  now?: () => Date;
}

export interface GetPlanningPlanInput {
  db: DatabaseConnection['db'];
  channelId: string;
  dateFrom: string;
  dateTo: string;
  now?: () => Date;
}

const PERSISTED_PLAN_ROW_SCHEMA = z.object({
  planId: z.string().min(1),
  channelId: z.string().min(1),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  generatedAt: z.iso.datetime(),
});

const PERSISTED_RECOMMENDATION_ROW_SCHEMA = z.object({
  recommendationId: z.string().min(1),
  slotDate: z.iso.date(),
  slotOrder: z.number().int().positive(),
  topicClusterId: z.string().min(1),
  topicLabel: z.string().min(1),
  suggestedTitle: z.string().min(1),
  priorityScore: z.number().min(0).max(100),
  confidence: z.enum(['low', 'medium', 'high']),
  rationale: z.string().min(1),
  evidenceJson: z.string().min(2),
  warningsJson: z.string().min(2),
});

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function createPlanningError(
  code: string,
  message: string,
  context: Record<string, unknown>,
  cause?: unknown,
): AppError {
  return AppError.create(code, message, 'error', context, cause ? toError(cause) : undefined);
}

function validateDateRange(dateFrom: string, dateTo: string): Result<void, AppError> {
  if (dateFrom > dateTo) {
    return err(
      createPlanningError(
        'PLANNING_INVALID_DATE_RANGE',
        'Data poczatkowa nie moze byc pozniejsza niz data koncowa.',
        { dateFrom, dateTo },
      ),
    );
  }
  return ok(undefined);
}

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.min(maxValue, Math.max(minValue, value));
}

function round(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 1_000_000) / 1_000_000;
}

function confidenceToScore(confidence: 'low' | 'medium' | 'high'): number {
  switch (confidence) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
  }
}

function scoreToConfidence(score: number): PlanningConfidence {
  if (score >= 2.45) {
    return 'high';
  }
  if (score >= 1.75) {
    return 'medium';
  }
  return 'low';
}

function parseJsonStringArray(jsonText: string, context: Record<string, unknown>): Result<string[], AppError> {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!Array.isArray(parsed)) {
      return err(
        createPlanningError(
          'PLANNING_INVALID_JSON_ARRAY',
          'Nieprawidlowy JSON tablicy w zapisanym payloadzie planowania.',
          context,
        ),
      );
    }

    const values = parsed
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim());
    return ok(values);
  } catch (cause) {
    return err(
      createPlanningError(
        'PLANNING_JSON_PARSE_FAILED',
        'Nie udalo sie sparsowac zapisanego payloadu JSON planowania.',
        context,
        cause,
      ),
    );
  }
}

function parsePlanningEvidence(jsonText: string, context: Record<string, unknown>): Result<PlanningEvidenceItemDTO[], AppError> {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    const schema = z.array(
      z.object({
        evidenceId: z.string().min(1),
        source: z.enum(['quality_scoring', 'competitor_intelligence', 'topic_intelligence']),
        label: z.string().min(1),
        value: z.string().min(1),
        context: z.string().nullable(),
      }),
    );
    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      return err(
        createPlanningError(
          'PLANNING_EVIDENCE_INVALID',
          'Nieprawidlowy payload evidence w zapisanej rekomendacji planowania.',
          { ...context, issues: validated.error.issues },
        ),
      );
    }
    return ok(validated.data);
  } catch (cause) {
    return err(
      createPlanningError(
        'PLANNING_EVIDENCE_PARSE_FAILED',
        'Nie udalo sie sparsowac zapisanego evidence planowania.',
        context,
        cause,
      ),
    );
  }
}

function toSuggestionTitle(label: string, keywords: readonly string[]): string {
  const main = keywords[0] ?? label;
  const secondary = keywords[1] ?? 'praktyczny przewodnik';
  const normalizedMain = main.trim().length > 0 ? main.trim() : label;
  return `${label}: ${normalizedMain} i ${secondary} w praktyce`;
}

function buildSlotDates(dateFrom: string, dateTo: string, count: number): string[] {
  if (count <= 0) {
    return [];
  }

  const startMs = new Date(`${dateFrom}T00:00:00.000Z`).getTime();
  const endMs = new Date(`${dateTo}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return [dateFrom];
  }

  if (count === 1 || startMs === endMs) {
    return [dateFrom];
  }

  const totalDays = Math.max(1, Math.round((endMs - startMs) / 86_400_000));
  const stepDays = Math.max(1, Math.floor(totalDays / Math.max(1, count - 1)));
  const slots: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const dayOffset = Math.min(totalDays, index * stepDays);
    const slotDate = new Date(startMs + dayOffset * 86_400_000).toISOString().slice(0, 10);
    slots.push(slotDate);
  }

  return slots;
}

function createPlanId(channelId: string, dateFrom: string, dateTo: string, generatedAt: string): string {
  const token = generatedAt.replaceAll(/[^0-9]/g, '').slice(0, 17);
  return `plan-${channelId}-${dateFrom}-${dateTo}-${token}`;
}

function persistPlan(
  input: {
    db: DatabaseConnection['db'];
    planId: string;
    channelId: string;
    dateFrom: string;
    dateTo: string;
    generatedAt: string;
    items: PlanningRecommendationItemDTO[];
  },
): Result<void, AppError> {
  const planningRepository = createPlanningRepository(input.db);
  const persistResult = planningRepository.runInTransaction(() => {
    const deleteResult = planningRepository.deletePlansWindow({
      channelId: input.channelId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });
    if (!deleteResult.ok) {
      return deleteResult;
    }

    const insertPlanResult = planningRepository.insertPlan({
      planId: input.planId,
      channelId: input.channelId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      generatedAt: input.generatedAt,
      algorithmVersion: ALGORITHM_VERSION,
      recommendationsCount: input.items.length,
    });
    if (!insertPlanResult.ok) {
      return insertPlanResult;
    }

    for (const item of input.items) {
      const insertRecommendationResult = planningRepository.insertRecommendation({
        recommendationId: item.recommendationId,
        planId: input.planId,
        channelId: input.channelId,
        slotDate: item.slotDate,
        slotOrder: item.slotOrder,
        topicClusterId: item.topicClusterId,
        topicLabel: item.topicLabel,
        suggestedTitle: item.suggestedTitle,
        priorityScore: item.priorityScore,
        confidence: item.confidence,
        rationale: item.rationale,
        evidenceJson: JSON.stringify(item.evidence),
        warningsJson: JSON.stringify(item.warnings),
        createdAt: input.generatedAt,
      });
      if (!insertRecommendationResult.ok) {
        return insertRecommendationResult;
      }
    }

    return ok(undefined);
  });

  if (!persistResult.ok) {
    return err(
      createPlanningError(
        'PLANNING_PERSIST_FAILED',
        'Nie udalo sie zapisac rekomendacji planowania.',
        {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          recommendations: input.items.length,
          causeErrorCode: persistResult.error.code,
        },
        persistResult.error,
      ),
    );
  }

  return ok(undefined);
}

function buildCandidates(input: {
  channelId: string;
  dateFrom: string;
  dateTo: string;
  quality: QualityScoreResultDTO;
  competitor: CompetitorInsightsResultDTO;
  topic: TopicIntelligenceResultDTO;
}): PlanningCandidate[] {
  const topQualityItems = input.quality.items.slice(0, 5);
  const qualityAverage = topQualityItems.length > 0
    ? topQualityItems.reduce((sum, item) => sum + item.score, 0) / topQualityItems.length
    : 0;
  const highQualityRatio = topQualityItems.length > 0
    ? topQualityItems.filter((item) => item.confidence === 'high').length / topQualityItems.length
    : 0;
  const qualityConfidence = scoreToConfidence(
    topQualityItems.length > 0
      ? topQualityItems.reduce((sum, item) => sum + confidenceToScore(item.confidence), 0) / topQualityItems.length
      : 1.5,
  );

  const hitCount = input.competitor.hits.length;
  const maxRelativeGrowth = input.competitor.items.reduce(
    (maxValue, item) => Math.max(maxValue, item.relativeGrowth),
    0,
  );
  const competitorPressure = clamp(
    0.2 + hitCount * 0.07 + Math.max(0, maxRelativeGrowth) * 0.4,
    0,
    1,
  );

  const maxGapScore = input.topic.gaps.reduce((maxValue, gap) => Math.max(maxValue, gap.gapScore), 0);
  const candidates: PlanningCandidate[] = input.topic.gaps.map((gap, index) => {
    const gapScoreNorm = maxGapScore > 0 ? clamp(gap.gapScore / maxGapScore, 0, 1) : 0;
    const trendBonus = gap.trendDirection === 'rising'
      ? 0.12
      : gap.trendDirection === 'stable'
        ? 0.05
        : -0.05;
    const qualityBoost = clamp((qualityAverage / 100) * 0.2 + highQualityRatio * 0.08, 0, 0.28);
    const competitorBoost = competitorPressure * 0.2;
    const cannibalizationPenalty = gap.cannibalizationRisk * 0.25;

    const score01 = clamp(
      gapScoreNorm * 0.45 + trendBonus + qualityBoost + competitorBoost - cannibalizationPenalty,
      0,
      1,
    );

    const confidenceSignal = (confidenceToScore(gap.confidence) * 0.6)
      + (confidenceToScore(qualityConfidence) * 0.25)
      + ((competitorPressure >= 0.45 ? 2.2 : 1.6) * 0.15);
    const confidence = scoreToConfidence(confidenceSignal);

    const evidence: PlanningEvidenceItemDTO[] = [
      {
        evidenceId: `ev-topic-${gap.clusterId}-${index}`,
        source: 'topic_intelligence',
        label: 'Wynik luki tematycznej',
        value: gap.gapScore.toFixed(2),
        context: `trend=${gap.trendDirection}; pokrycie=${(gap.ownerCoverage * 100).toFixed(1)}%`,
      },
      {
        evidenceId: `ev-quality-${gap.clusterId}-${index}`,
        source: 'quality_scoring',
        label: 'Średni quality score (top 5)',
        value: qualityAverage.toFixed(2),
        context: `pewność jakości=${qualityConfidence}`,
      },
      {
        evidenceId: `ev-competitor-${gap.clusterId}-${index}`,
        source: 'competitor_intelligence',
        label: 'Presja konkurencji',
        value: competitorPressure.toFixed(3),
        context: `hity=${hitCount}; max_relative_growth=${maxRelativeGrowth.toFixed(3)}`,
      },
    ];

    const warnings: string[] = [];
    if (gap.cannibalizationRisk >= 0.65) {
      warnings.push('Wysokie ryzyko kanibalizacji. Zachowaj większy odstęp między podobnymi publikacjami.');
    }
    if (gap.trendDirection === 'declining') {
      warnings.push('Trend tematu jest spadkowy. Rozważ test mniejszego formatu.');
    }

    return {
      topicClusterId: gap.clusterId,
      topicLabel: gap.label,
      suggestedTitle: toSuggestionTitle(gap.label, gap.keywords),
      priorityScore: round(score01 * 100),
      confidence,
      rationale: `Temat "${gap.label}" łączy potencjał luki (${gap.gapScore.toFixed(2)}) z presją konkurencji i jakością dotychczasowych wyników.`,
      evidence,
      warnings,
      cannibalizationRisk: gap.cannibalizationRisk,
    };
  });

  if (candidates.length > 0) {
    return candidates;
  }

  if (topQualityItems.length === 0) {
    return [];
  }

  const fallbackEvidence: PlanningEvidenceItemDTO[] = [
    {
      evidenceId: 'ev-fallback-quality',
      source: 'quality_scoring',
      label: 'Brak wykrytych luk tematycznych',
      value: qualityAverage.toFixed(2),
      context: 'Plan bazuje na historycznej jakości materiałów.',
    },
  ];

  if (input.competitor.hits.length > 0) {
    fallbackEvidence.push({
      evidenceId: 'ev-fallback-competitor',
      source: 'competitor_intelligence',
      label: 'Aktywne hity konkurencji',
      value: String(input.competitor.hits.length),
      context: 'Warto utrzymać regularny rytm publikacji.',
    });
  }

  return [
    {
      topicClusterId: 'topic-general',
      topicLabel: 'Temat priorytetowy',
      suggestedTitle: `Temat priorytetowy: rozwinięcie najlepszego formatu (${topQualityItems[0]?.title ?? 'format kanału'})`,
      priorityScore: round(clamp((qualityAverage / 100) * 70 + competitorPressure * 30, 0, 100)),
      confidence: qualityConfidence,
      rationale: 'Brak jednoznacznych luk tematycznych, więc rekomendacja opiera się o najwyższą jakość historycznych materiałów.',
      evidence: fallbackEvidence,
      warnings: [],
      cannibalizationRisk: 0,
    },
  ];
}

function toRecommendations(
  planId: string,
  dateFrom: string,
  dateTo: string,
  candidates: PlanningCandidate[],
  maxRecommendations: number,
): PlanningRecommendationItemDTO[] {
  const sorted = [...candidates].sort((a, b) =>
    b.priorityScore - a.priorityScore
    || a.cannibalizationRisk - b.cannibalizationRisk
    || a.topicClusterId.localeCompare(b.topicClusterId));

  const deduplicated: PlanningCandidate[] = [];
  const seenClusters = new Set<string>();
  for (const candidate of sorted) {
    if (seenClusters.has(candidate.topicClusterId)) {
      continue;
    }
    seenClusters.add(candidate.topicClusterId);
    deduplicated.push(candidate);
  }

  const selected = deduplicated.slice(0, Math.max(1, maxRecommendations));
  const slotDates = buildSlotDates(dateFrom, dateTo, selected.length);

  return selected.map((candidate, index) => ({
    recommendationId: `rec-${planId}-${String(index + 1).padStart(3, '0')}`,
    slotDate: slotDates[index] ?? dateFrom,
    slotOrder: index + 1,
    topicClusterId: candidate.topicClusterId,
    topicLabel: candidate.topicLabel,
    suggestedTitle: candidate.suggestedTitle,
    priorityScore: candidate.priorityScore,
    confidence: candidate.confidence,
    rationale: candidate.rationale,
    evidence: candidate.evidence,
    warnings: candidate.warnings,
  }));
}

export function generatePlanningPlan(input: GeneratePlanningPlanInput): Result<PlanningPlanResultDTO, AppError> {
  const now = input.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const maxRecommendations = input.maxRecommendations ?? 7;
  const clusterLimit = input.clusterLimit ?? 12;
  const gapLimit = input.gapLimit ?? 10;

  const rangeValidation = validateDateRange(input.dateFrom, input.dateTo);
  if (!rangeValidation.ok) {
    return rangeValidation;
  }

  const topicRunResult = runTopicIntelligence({
    db: input.db,
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    clusterLimit,
    gapLimit,
    now: input.now,
  });
  if (!topicRunResult.ok) {
    return topicRunResult;
  }

  const qualityResult = getQualityScores({
    db: input.db,
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    limit: 20,
    now: input.now,
  });
  if (!qualityResult.ok) {
    return qualityResult;
  }

  const competitorResult = getCompetitorInsights({
    db: input.db,
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    limit: 10,
    now: input.now,
  });
  if (!competitorResult.ok) {
    return competitorResult;
  }

  const candidates = buildCandidates({
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    quality: qualityResult.value,
    competitor: competitorResult.value,
    topic: topicRunResult.value,
  });

  const planId = createPlanId(input.channelId, input.dateFrom, input.dateTo, generatedAt);
  const items = toRecommendations(
    planId,
    input.dateFrom,
    input.dateTo,
    candidates,
    maxRecommendations,
  );

  const persistResult = persistPlan({
    db: input.db,
    planId,
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    generatedAt,
    items,
  });
  if (!persistResult.ok) {
    return persistResult;
  }

  return ok({
    planId,
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    generatedAt,
    totalRecommendations: items.length,
    items,
  });
}

export function getPlanningPlan(input: GetPlanningPlanInput): Result<PlanningPlanResultDTO, AppError> {
  const now = input.now ?? (() => new Date());
  const generatedAtFallback = now().toISOString();

  const rangeValidation = validateDateRange(input.dateFrom, input.dateTo);
  if (!rangeValidation.ok) {
    return rangeValidation;
  }

  const planningQueries = createPlanningQueries(input.db);
  let persistedPlanRow: PersistedPlanRow | null = null;
  let persistedRecommendationRows: PersistedRecommendationRow[] = [];
  const planRowResult = planningQueries.getLatestPlanHeader({
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });
  if (!planRowResult.ok) {
    return err(
      createPlanningError(
        'PLANNING_READ_FAILED',
        'Nie udalo sie odczytac zapisanych danych planowania.',
        {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          causeErrorCode: planRowResult.error.code,
        },
        planRowResult.error,
      ),
    );
  }
  persistedPlanRow = planRowResult.value;

  if (persistedPlanRow) {
    const recommendationRowsResult = planningQueries.listRecommendationsByPlanId({ planId: persistedPlanRow.planId });
    if (!recommendationRowsResult.ok) {
      return err(
        createPlanningError(
          'PLANNING_READ_FAILED',
          'Nie udalo sie odczytac zapisanych danych planowania.',
          {
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            planId: persistedPlanRow.planId,
            causeErrorCode: recommendationRowsResult.error.code,
          },
          recommendationRowsResult.error,
        ),
      );
    }
    persistedRecommendationRows = recommendationRowsResult.value;
  }

  if (!persistedPlanRow) {
    return ok({
      planId: `plan-empty-${input.channelId}-${input.dateFrom}-${input.dateTo}`,
      channelId: input.channelId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      generatedAt: generatedAtFallback,
      totalRecommendations: 0,
      items: [],
    });
  }

  const parsedPlan = PERSISTED_PLAN_ROW_SCHEMA.safeParse(persistedPlanRow);
  if (!parsedPlan.success) {
    return err(
      createPlanningError(
        'PLANNING_ROW_INVALID',
        'Zapisany naglowek planowania ma nieprawidlowy format.',
        {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          issues: parsedPlan.error.issues,
        },
      ),
    );
  }

  const items: PlanningRecommendationItemDTO[] = [];
  for (let index = 0; index < persistedRecommendationRows.length; index += 1) {
    const parsedRecommendation = PERSISTED_RECOMMENDATION_ROW_SCHEMA.safeParse(persistedRecommendationRows[index]);
    if (!parsedRecommendation.success) {
      return err(
        createPlanningError(
          'PLANNING_RECOMMENDATION_ROW_INVALID',
          'Zapisana rekomendacja planowania ma nieprawidlowy format.',
          {
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            rowIndex: index,
            issues: parsedRecommendation.error.issues,
          },
        ),
      );
    }

    const evidenceResult = parsePlanningEvidence(parsedRecommendation.data.evidenceJson, {
      channelId: input.channelId,
      recommendationId: parsedRecommendation.data.recommendationId,
    });
    if (!evidenceResult.ok) {
      return evidenceResult;
    }

    const warningsResult = parseJsonStringArray(parsedRecommendation.data.warningsJson, {
      channelId: input.channelId,
      recommendationId: parsedRecommendation.data.recommendationId,
    });
    if (!warningsResult.ok) {
      return warningsResult;
    }

    items.push({
      recommendationId: parsedRecommendation.data.recommendationId,
      slotDate: parsedRecommendation.data.slotDate,
      slotOrder: parsedRecommendation.data.slotOrder,
      topicClusterId: parsedRecommendation.data.topicClusterId,
      topicLabel: parsedRecommendation.data.topicLabel,
      suggestedTitle: parsedRecommendation.data.suggestedTitle,
      priorityScore: round(parsedRecommendation.data.priorityScore),
      confidence: parsedRecommendation.data.confidence,
      rationale: parsedRecommendation.data.rationale,
      evidence: evidenceResult.value,
      warnings: warningsResult.value,
    });
  }

  return ok({
    planId: parsedPlan.data.planId,
    channelId: parsedPlan.data.channelId,
    dateFrom: parsedPlan.data.dateFrom,
    dateTo: parsedPlan.data.dateTo,
    generatedAt: parsedPlan.data.generatedAt,
    totalRecommendations: items.length,
    items,
  });
}
