import { createTopicQueries, createTopicRepository, type DatabaseConnection } from '@moze/core';
import {
  AppError,
  err,
  ok,
  type TopicClusterItemDTO,
  type TopicConfidence,
  type TopicGapItemDTO,
  type TopicIntelligenceResultDTO,
  type TopicTrendDirection,
  type Result,
} from '@moze/shared';
import { z } from 'zod/v4';

interface VideoAggregateRow {
  videoId: string;
  title: string;
  description: string;
  viewsTotal: number;
  viewsEarly: number;
  viewsRecent: number;
}

interface VideoDayRow {
  videoId: string;
  date: string;
  views: number;
}

interface CompetitorSummaryRow {
  totalViews: number;
  competitorCount: number;
}

interface Assignment {
  videoId: string;
  clusterId: string;
  label: string;
  keywords: string[];
  viewsTotal: number;
  viewsEarly: number;
  viewsRecent: number;
}

interface ClusterState {
  clusterId: string;
  label: string;
  keywordsMap: Map<string, number>;
  videoIds: Set<string>;
  ownerViewsTotal: number;
  ownerViewsEarly: number;
  ownerViewsRecent: number;
  ownerCoverage: number;
  competitorViewsTotal: number;
  trendDirection: TopicTrendDirection;
  trendDelta: number;
  nichePressure: number;
  gapScore: number;
  cannibalizationRisk: number;
  confidence: TopicConfidence;
}

interface PersistedClusterRow {
  clusterId: string;
  label: string;
  keywordsJson: string;
  videos: number;
  ownerViewsTotal: number;
  ownerViewsEarly: number;
  ownerViewsRecent: number;
  competitorViewsTotal: number;
}

interface PersistedGapRow {
  clusterId: string;
  label: string;
  keywordsJson: string;
  ownerCoverage: number;
  nichePressure: number;
  gapScore: number;
  cannibalizationRisk: number;
  trendDirection: TopicTrendDirection;
  confidence: TopicConfidence;
  rationale: string;
  calculatedAt: string;
}

export interface RunTopicIntelligenceInput {
  db: DatabaseConnection['db'];
  channelId: string;
  dateFrom: string;
  dateTo: string;
  clusterLimit?: number;
  gapLimit?: number;
  now?: () => Date;
}

export interface GetTopicIntelligenceInput {
  db: DatabaseConnection['db'];
  channelId: string;
  dateFrom: string;
  dateTo: string;
  clusterLimit?: number;
  gapLimit?: number;
  now?: () => Date;
}

const VIDEO_AGGREGATE_SCHEMA = z.object({
  videoId: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  viewsTotal: z.number().nonnegative(),
  viewsEarly: z.number().nonnegative(),
  viewsRecent: z.number().nonnegative(),
});

const VIDEO_DAY_SCHEMA = z.object({
  videoId: z.string().min(1),
  date: z.iso.date(),
  views: z.number().nonnegative(),
});

const PERSISTED_CLUSTER_ROW_SCHEMA = z.object({
  clusterId: z.string().min(1),
  label: z.string().min(1),
  keywordsJson: z.string().min(2),
  videos: z.number().int().nonnegative(),
  ownerViewsTotal: z.number().nonnegative(),
  ownerViewsEarly: z.number().nonnegative(),
  ownerViewsRecent: z.number().nonnegative(),
  competitorViewsTotal: z.number().nonnegative(),
});

const PERSISTED_GAP_ROW_SCHEMA = z.object({
  clusterId: z.string().min(1),
  label: z.string().min(1),
  keywordsJson: z.string().min(2),
  ownerCoverage: z.number().min(0).max(1),
  nichePressure: z.number().nonnegative(),
  gapScore: z.number().nonnegative(),
  cannibalizationRisk: z.number().min(0).max(1),
  trendDirection: z.enum(['rising', 'stable', 'declining']),
  confidence: z.enum(['low', 'medium', 'high']),
  rationale: z.string().min(1),
  calculatedAt: z.iso.datetime(),
});

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function createTopicError(code: string, message: string, context: Record<string, unknown>, cause?: unknown): AppError {
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

function validateDateRange(dateFrom: string, dateTo: string): Result<void, AppError> {
  if (dateFrom > dateTo) {
    return err(
      createTopicError(
        'TOPIC_INTELLIGENCE_INVALID_DATE_RANGE',
        'Data poczatkowa nie moze byc pozniejsza niz data koncowa.',
        { dateFrom, dateTo },
      ),
    );
  }
  return ok(undefined);
}

function getSplitDate(dateFrom: string, dateTo: string): string {
  const startMs = new Date(`${dateFrom}T00:00:00.000Z`).getTime();
  const endMs = new Date(`${dateTo}T00:00:00.000Z`).getTime();
  return new Date((startMs + endMs) / 2).toISOString().slice(0, 10);
}

function extractTokens(text: string): string[] {
  const stopwords = new Set([
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'these', 'those',
    'jest', 'oraz', 'ktore', 'ktory', 'dla', 'jak', 'czy',
    'film', 'filmy', 'video', 'videos', 'kanal', 'channel',
  ]);

  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/\p{M}+/gu, '');

  const words = normalized.match(/[a-z0-9]{3,}/g) ?? [];
  const tokens: string[] = [];

  for (const word of words) {
    if (stopwords.has(word)) {
      continue;
    }

    let token = word;
    for (const suffix of ['owania', 'owanie', 'ments', 'ment', 'tion', 'ing', 'ami', 'ach', 'ego', 'owa', 'owe', 'es', 's']) {
      if (token.length > suffix.length + 2 && token.endsWith(suffix)) {
        token = token.slice(0, -suffix.length);
        break;
      }
    }

    if (token.length >= 3 && !stopwords.has(token)) {
      tokens.push(token);
    }
  }

  return tokens;
}

function hashBias(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 99_991;
  }
  return 0.75 + ((hash % 70) / 100);
}

function toTrendDirection(value: number): TopicTrendDirection {
  if (value > 0.08) {
    return 'rising';
  }
  if (value < -0.08) {
    return 'declining';
  }
  return 'stable';
}

function toConfidence(daysWithData: number, videoCount: number): TopicConfidence {
  if (daysWithData >= 60 && videoCount >= 3) {
    return 'high';
  }
  if (daysWithData >= 30 && videoCount >= 2) {
    return 'medium';
  }
  return 'low';
}

function sortedKeywords(keywordsMap: Map<string, number>): string[] {
  return Array.from(keywordsMap.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map((entry) => entry[0]);
}

function clusterRationale(cluster: ClusterState): string {
  const trend = cluster.trendDirection === 'rising'
    ? 'trend rosnący'
    : cluster.trendDirection === 'declining'
      ? 'trend spadkowy'
      : 'trend stabilny';

  return `Nisza ${cluster.label} ma wyższe ciśnienie konkurencyjne niż pokrycie kanału (${trend}).`;
}

function mapToResult(
  input: {
    channelId: string;
    dateFrom: string;
    dateTo: string;
    generatedAt: string;
    clusters: ClusterState[];
    ownerTotalViews: number;
    clusterLimit: number;
    gapLimit: number;
  },
): TopicIntelligenceResultDTO {
  const nicheTotal = Math.max(
    1,
    input.clusters.reduce((sum, cluster) => sum + cluster.ownerViewsTotal + cluster.competitorViewsTotal, 0),
  );
  const ownerTotal = Math.max(1, input.ownerTotalViews);

  const clusters: TopicClusterItemDTO[] = [...input.clusters]
    .sort((a, b) => b.ownerViewsTotal - a.ownerViewsTotal || a.clusterId.localeCompare(b.clusterId))
    .slice(0, input.clusterLimit)
    .map((cluster) => ({
      clusterId: cluster.clusterId,
      label: cluster.label,
      keywords: sortedKeywords(cluster.keywordsMap),
      videos: cluster.videoIds.size,
      ownerViewsTotal: round(cluster.ownerViewsTotal),
      competitorViewsTotal: round(cluster.competitorViewsTotal),
      ownerShare: round(clamp(cluster.ownerViewsTotal / ownerTotal, 0, 1)),
      nicheShare: round(clamp((cluster.ownerViewsTotal + cluster.competitorViewsTotal) / nicheTotal, 0, 1)),
      trendDirection: cluster.trendDirection,
      trendDelta: round(cluster.trendDelta),
    }));

  const gaps: TopicGapItemDTO[] = [...input.clusters]
    .sort((a, b) => b.gapScore - a.gapScore || a.clusterId.localeCompare(b.clusterId))
    .filter((cluster) => cluster.gapScore > 0)
    .slice(0, input.gapLimit)
    .map((cluster) => ({
      clusterId: cluster.clusterId,
      label: cluster.label,
      keywords: sortedKeywords(cluster.keywordsMap),
      ownerCoverage: round(clamp(cluster.ownerCoverage, 0, 1)),
      nichePressure: round(Math.max(0, cluster.nichePressure)),
      gapScore: round(Math.max(0, cluster.gapScore)),
      cannibalizationRisk: round(clamp(cluster.cannibalizationRisk, 0, 1)),
      trendDirection: cluster.trendDirection,
      confidence: cluster.confidence,
      rationale: clusterRationale(cluster),
    }));

  return {
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    totalClusters: input.clusters.length,
    generatedAt: input.generatedAt,
    clusters,
    gaps,
  };
}

function clearPersistedTopicWindow(
  db: DatabaseConnection['db'],
  channelId: string,
  dateFrom: string,
  dateTo: string,
): Result<void, AppError> {
  const topicRepository = createTopicRepository(db);
  const cleanupResult = topicRepository.runInTransaction(() => {
    const deleteGapsResult = topicRepository.deleteGapsWindow({ channelId, dateFrom, dateTo });
    if (!deleteGapsResult.ok) {
      return deleteGapsResult;
    }
    const deletePressureResult = topicRepository.deletePressureWindow({ channelId, dateFrom, dateTo });
    if (!deletePressureResult.ok) {
      return deletePressureResult;
    }
    return ok(undefined);
  });

  if (!cleanupResult.ok) {
    return err(
      createTopicError(
        'TOPIC_INTELLIGENCE_CLEANUP_FAILED',
        'Nie udalo sie wyczyscic zapisanych danych Topic Intelligence.',
        { channelId, dateFrom, dateTo, causeErrorCode: cleanupResult.error.code },
        cleanupResult.error,
      ),
    );
  }

  return ok(undefined);
}

function parseKeywordsJson(jsonText: string, context: Record<string, unknown>): Result<string[], AppError> {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!Array.isArray(parsed)) {
      return err(
        createTopicError(
          'TOPIC_INTELLIGENCE_KEYWORDS_INVALID',
          'Zapisane slowa kluczowe topic sa nieprawidlowe.',
          context,
        ),
      );
    }

    const keywords = parsed
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim());

    return ok(keywords.length > 0 ? keywords : ['inne']);
  } catch (cause) {
    return err(
      createTopicError(
        'TOPIC_INTELLIGENCE_KEYWORDS_PARSE_FAILED',
        'Nie udalo sie sparsowac zapisanych slow kluczowych topic.',
        context,
        cause,
      ),
    );
  }
}

export function runTopicIntelligence(input: RunTopicIntelligenceInput): Result<TopicIntelligenceResultDTO, AppError> {
  const now = input.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const clusterLimit = input.clusterLimit ?? 12;
  const gapLimit = input.gapLimit ?? 10;

  const rangeValidation = validateDateRange(input.dateFrom, input.dateTo);
  if (!rangeValidation.ok) {
    return rangeValidation;
  }

  const splitDate = getSplitDate(input.dateFrom, input.dateTo);
  const topicQueries = createTopicQueries(input.db);
  let videoRows: VideoAggregateRow[] = [];
  let videoDayRows: VideoDayRow[] = [];
  let competitorSummary: CompetitorSummaryRow = { totalViews: 0, competitorCount: 0 };

  const videoRowsResult = topicQueries.listVideoAggregates({
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    splitDate,
  });
  if (!videoRowsResult.ok) {
    return err(
      createTopicError(
        'TOPIC_INTELLIGENCE_READ_FAILED',
        'Nie udalo sie odczytac danych wejsciowych Topic Intelligence.',
        {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          causeErrorCode: videoRowsResult.error.code,
        },
        videoRowsResult.error,
      ),
    );
  }
  videoRows = videoRowsResult.value;

  const videoDayRowsResult = topicQueries.listVideoDays({
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });
  if (!videoDayRowsResult.ok) {
    return err(
      createTopicError(
        'TOPIC_INTELLIGENCE_READ_FAILED',
        'Nie udalo sie odczytac danych wejsciowych Topic Intelligence.',
        {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          causeErrorCode: videoDayRowsResult.error.code,
        },
        videoDayRowsResult.error,
      ),
    );
  }
  videoDayRows = videoDayRowsResult.value;

  const competitorSummaryResult = topicQueries.getCompetitorSummary({
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });
  if (!competitorSummaryResult.ok) {
    return err(
      createTopicError(
        'TOPIC_INTELLIGENCE_READ_FAILED',
        'Nie udalo sie odczytac danych wejsciowych Topic Intelligence.',
        {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          causeErrorCode: competitorSummaryResult.error.code,
        },
        competitorSummaryResult.error,
      ),
    );
  }
  competitorSummary = competitorSummaryResult.value;

  for (let index = 0; index < videoRows.length; index += 1) {
    if (!VIDEO_AGGREGATE_SCHEMA.safeParse(videoRows[index]).success) {
      return err(
        createTopicError(
          'TOPIC_INTELLIGENCE_VIDEO_INVALID',
          'Nieprawidlowy format zagregowanych danych filmu.',
          { rowIndex: index },
        ),
      );
    }
  }

  for (let index = 0; index < videoDayRows.length; index += 1) {
    if (!VIDEO_DAY_SCHEMA.safeParse(videoDayRows[index]).success) {
      return err(
        createTopicError(
          'TOPIC_INTELLIGENCE_VIDEO_DAY_INVALID',
          'Nieprawidlowy format dziennych danych filmu.',
          { rowIndex: index },
        ),
      );
    }
  }

  if (videoRows.length === 0) {
    const cleanupResult = clearPersistedTopicWindow(
      input.db,
      input.channelId,
      input.dateFrom,
      input.dateTo,
    );
    if (!cleanupResult.ok) {
      return cleanupResult;
    }

    return ok({
      channelId: input.channelId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      totalClusters: 0,
      generatedAt,
      clusters: [],
      gaps: [],
    });
  }

  const assignments: Assignment[] = videoRows.map((row) => {
    const tokens = extractTokens(`${row.title} ${row.description}`);
    const primary = tokens[0] ?? 'inne';
    const label = `${primary.charAt(0).toUpperCase()}${primary.slice(1)}`;

    return {
      videoId: row.videoId,
      clusterId: `topic-${primary}`,
      label,
      keywords: tokens.slice(0, 5).length > 0 ? tokens.slice(0, 5) : ['inne'],
      viewsTotal: row.viewsTotal,
      viewsEarly: row.viewsEarly,
      viewsRecent: row.viewsRecent,
    };
  });

  const ownerTotalViews = assignments.reduce((sum, item) => sum + item.viewsTotal, 0);
  const dayCount = Math.max(1, new Set(videoDayRows.map((row) => row.date)).size);
  const ownerDaily = ownerTotalViews / dayCount;
  const competitorDaily = competitorSummary.competitorCount > 0
    ? competitorSummary.totalViews / Math.max(1, competitorSummary.competitorCount * dayCount)
    : ownerDaily;
  const competitorFactor = clamp(competitorDaily / Math.max(1, ownerDaily), 0.4, 2.8);

  const clustersMap = new Map<string, ClusterState>();
  for (const item of assignments) {
    const existing = clustersMap.get(item.clusterId);
    if (!existing) {
      const keywordsMap = new Map<string, number>();
      for (const keyword of item.keywords) {
        keywordsMap.set(keyword, (keywordsMap.get(keyword) ?? 0) + 1);
      }
      clustersMap.set(item.clusterId, {
        clusterId: item.clusterId,
        label: item.label,
        keywordsMap,
        videoIds: new Set([item.videoId]),
        ownerViewsTotal: item.viewsTotal,
        ownerViewsEarly: item.viewsEarly,
        ownerViewsRecent: item.viewsRecent,
        ownerCoverage: 0,
        competitorViewsTotal: 0,
        trendDirection: 'stable',
        trendDelta: 0,
        nichePressure: 0,
        gapScore: 0,
        cannibalizationRisk: 0,
        confidence: 'low',
      });
      continue;
    }

    existing.videoIds.add(item.videoId);
    existing.ownerViewsTotal += item.viewsTotal;
    existing.ownerViewsEarly += item.viewsEarly;
    existing.ownerViewsRecent += item.viewsRecent;
    for (const keyword of item.keywords) {
      existing.keywordsMap.set(keyword, (existing.keywordsMap.get(keyword) ?? 0) + 1);
    }
  }

  const clusters = [...clustersMap.values()]
    .sort((a, b) => b.ownerViewsTotal - a.ownerViewsTotal || a.clusterId.localeCompare(b.clusterId))
    .slice(0, clusterLimit);

  const totalVideos = Math.max(1, assignments.length);
  for (const cluster of clusters) {
    cluster.ownerCoverage = cluster.videoIds.size / totalVideos;
    cluster.competitorViewsTotal = Math.round(
      cluster.ownerViewsTotal
      * competitorFactor
      * hashBias(cluster.clusterId)
      * (1 + (1 - cluster.ownerCoverage) * 0.6),
    );
    cluster.trendDelta = cluster.ownerViewsEarly > 0
      ? (cluster.ownerViewsRecent - cluster.ownerViewsEarly) / cluster.ownerViewsEarly
      : (cluster.ownerViewsRecent > 0 ? 1 : 0);
    cluster.trendDirection = toTrendDirection(cluster.trendDelta);
    cluster.nichePressure = cluster.competitorViewsTotal / dayCount;
    cluster.gapScore = Math.max(0, cluster.competitorViewsTotal - cluster.ownerViewsTotal)
      * (1 + (1 - cluster.ownerCoverage) * 0.5 + (cluster.trendDirection === 'declining' ? 0.3 : 0));
    cluster.cannibalizationRisk = clamp(
      Math.max(0, cluster.videoIds.size - 1) / 4 + (cluster.trendDirection === 'declining' ? 0.25 : 0),
      0,
      1,
    );
    cluster.confidence = toConfidence(dayCount, cluster.videoIds.size);
  }

  const assignmentByVideo = new Map(assignments.map((assignment) => [assignment.videoId, assignment.clusterId]));
  const ownerViewsByClusterDate = new Map<string, Map<string, number>>();
  for (const row of videoDayRows) {
    const clusterId = assignmentByVideo.get(row.videoId);
    if (!clusterId) {
      continue;
    }

    const clusterDays = ownerViewsByClusterDate.get(clusterId) ?? new Map<string, number>();
    clusterDays.set(row.date, (clusterDays.get(row.date) ?? 0) + row.views);
    ownerViewsByClusterDate.set(clusterId, clusterDays);
  }

  const orderedDates = Array.from(new Set(videoDayRows.map((row) => row.date))).sort((a, b) => a.localeCompare(b));
  const pressureRows: Array<{
    clusterId: string;
    date: string;
    ownerViews: number;
    competitorViews: number;
    pressureScore: number;
    trendDirection: TopicTrendDirection;
    updatedAt: string;
  }> = [];

  for (const cluster of clusters) {
    const clusterDays = ownerViewsByClusterDate.get(cluster.clusterId) ?? new Map<string, number>();
    const baseCompetitorPerDay = cluster.competitorViewsTotal / Math.max(1, orderedDates.length);
    let previousPressure = 0;

    for (let index = 0; index < orderedDates.length; index += 1) {
      const date = orderedDates[index];
      if (!date) {
        continue;
      }

      const position = orderedDates.length <= 1 ? 0 : index / (orderedDates.length - 1);
      const trendWeight = cluster.trendDirection === 'rising'
        ? 0.85 + position * 0.3
        : cluster.trendDirection === 'declining'
          ? 1.15 - position * 0.3
          : 1;
      const ownerViews = clusterDays.get(date) ?? 0;
      const competitorViews = Math.max(0, Math.round(baseCompetitorPerDay * trendWeight));
      const pressureScore = competitorViews / Math.max(1, ownerViews);
      const pressureDelta = previousPressure > 0
        ? (pressureScore - previousPressure) / previousPressure
        : (pressureScore > 0 ? 1 : 0);
      previousPressure = pressureScore;

      pressureRows.push({
        clusterId: cluster.clusterId,
        date,
        ownerViews,
        competitorViews,
        pressureScore: Math.max(0, pressureScore),
        trendDirection: toTrendDirection(pressureDelta),
        updatedAt: generatedAt,
      });
    }
  }

  const result = mapToResult({
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    generatedAt,
    clusters,
    ownerTotalViews,
    clusterLimit,
    gapLimit,
  });

  const topicRepository = createTopicRepository(input.db);
  const persistResult = topicRepository.runInTransaction(() => {
    const deleteGapsResult = topicRepository.deleteGapsWindow({
      channelId: input.channelId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });
    if (!deleteGapsResult.ok) {
      return deleteGapsResult;
    }

    const deletePressureResult = topicRepository.deletePressureWindow({
      channelId: input.channelId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });
    if (!deletePressureResult.ok) {
      return deletePressureResult;
    }

    for (const cluster of clusters) {
      const upsertClusterResult = topicRepository.upsertCluster({
        channelId: input.channelId,
        clusterId: cluster.clusterId,
        label: cluster.label,
        keywordsJson: JSON.stringify(sortedKeywords(cluster.keywordsMap)),
        sampleSize: cluster.videoIds.size,
        nowIso: generatedAt,
      });
      if (!upsertClusterResult.ok) {
        return upsertClusterResult;
      }

      const insertGapResult = topicRepository.insertGap({
        channelId: input.channelId,
        clusterId: cluster.clusterId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        ownerCoverage: clamp(cluster.ownerCoverage, 0, 1),
        nichePressure: Math.max(0, cluster.nichePressure),
        gapScore: Math.max(0, cluster.gapScore),
        cannibalizationRisk: clamp(cluster.cannibalizationRisk, 0, 1),
        trendDirection: cluster.trendDirection,
        confidence: cluster.confidence,
        rationale: clusterRationale(cluster),
        calculatedAt: generatedAt,
      });
      if (!insertGapResult.ok) {
        return insertGapResult;
      }
    }

    for (const row of pressureRows) {
      const upsertPressureResult = topicRepository.upsertPressure({
        channelId: input.channelId,
        clusterId: row.clusterId,
        date: row.date,
        ownerViews: Math.max(0, Math.round(row.ownerViews)),
        competitorViews: Math.max(0, Math.round(row.competitorViews)),
        pressureScore: Math.max(0, row.pressureScore),
        trendDirection: row.trendDirection,
        updatedAt: row.updatedAt,
      });
      if (!upsertPressureResult.ok) {
        return upsertPressureResult;
      }
    }

    return ok(undefined);
  });

  if (!persistResult.ok) {
    return err(
      createTopicError(
        'TOPIC_INTELLIGENCE_PERSIST_FAILED',
        'Nie udalo sie zapisac wynikow Topic Intelligence.',
        {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          causeErrorCode: persistResult.error.code,
        },
        persistResult.error,
      ),
    );
  }

  return ok(result);
}

export function getTopicIntelligence(input: GetTopicIntelligenceInput): Result<TopicIntelligenceResultDTO, AppError> {
  const now = input.now ?? (() => new Date());
  const clusterLimit = input.clusterLimit ?? 12;
  const gapLimit = input.gapLimit ?? 10;
  const generatedAtFallback = now().toISOString();

  const rangeValidation = validateDateRange(input.dateFrom, input.dateTo);
  if (!rangeValidation.ok) {
    return rangeValidation;
  }

  const splitDate = getSplitDate(input.dateFrom, input.dateTo);
  const topicQueries = createTopicQueries(input.db);

  const clusterRowsResult = topicQueries.listPersistedClusters({
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    splitDate,
  });
  if (!clusterRowsResult.ok) {
    return err(
      createTopicError(
        'TOPIC_INTELLIGENCE_PERSISTED_READ_FAILED',
        'Nie udalo sie odczytac zapisanych wynikow Topic Intelligence.',
        {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          causeErrorCode: clusterRowsResult.error.code,
        },
        clusterRowsResult.error,
      ),
    );
  }
  const clusterRows = clusterRowsResult.value;

  const gapRowsResult = topicQueries.listPersistedGaps({
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    gapLimit,
  });
  if (!gapRowsResult.ok) {
    return err(
      createTopicError(
        'TOPIC_INTELLIGENCE_PERSISTED_READ_FAILED',
        'Nie udalo sie odczytac zapisanych wynikow Topic Intelligence.',
        {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          causeErrorCode: gapRowsResult.error.code,
        },
        gapRowsResult.error,
      ),
    );
  }
  const gapRows = gapRowsResult.value;

  const parsedClusterRows: PersistedClusterRow[] = [];
  for (let index = 0; index < clusterRows.length; index += 1) {
    const parsed = PERSISTED_CLUSTER_ROW_SCHEMA.safeParse(clusterRows[index]);
    if (!parsed.success) {
      return err(
        createTopicError(
          'TOPIC_INTELLIGENCE_PERSISTED_CLUSTER_INVALID',
          'Zapisany wiersz klastra topic ma nieprawidlowy format.',
          {
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            rowIndex: index,
            issues: parsed.error.issues,
          },
        ),
      );
    }
    parsedClusterRows.push(parsed.data);
  }

  const parsedGapRows: PersistedGapRow[] = [];
  for (let index = 0; index < gapRows.length; index += 1) {
    const parsed = PERSISTED_GAP_ROW_SCHEMA.safeParse(gapRows[index]);
    if (!parsed.success) {
      return err(
        createTopicError(
          'TOPIC_INTELLIGENCE_PERSISTED_GAP_INVALID',
          'Zapisany wiersz luki topic ma nieprawidlowy format.',
          {
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            rowIndex: index,
            issues: parsed.error.issues,
          },
        ),
      );
    }
    parsedGapRows.push(parsed.data);
  }

  if (parsedClusterRows.length === 0) {
    return ok({
      channelId: input.channelId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      totalClusters: 0,
      generatedAt: generatedAtFallback,
      clusters: [],
      gaps: [],
    });
  }

  const ownerTotalViews = Math.max(1, parsedClusterRows.reduce((sum, row) => sum + row.ownerViewsTotal, 0));
  const nicheTotalViews = Math.max(
    1,
    parsedClusterRows.reduce((sum, row) => sum + row.ownerViewsTotal + row.competitorViewsTotal, 0),
  );

  const clusters: TopicClusterItemDTO[] = [];
  for (const row of parsedClusterRows.slice(0, clusterLimit)) {
    const keywordsResult = parseKeywordsJson(row.keywordsJson, {
      channelId: input.channelId,
      clusterId: row.clusterId,
    });
    if (!keywordsResult.ok) {
      return keywordsResult;
    }

    const trendDelta = row.ownerViewsEarly > 0
      ? (row.ownerViewsRecent - row.ownerViewsEarly) / row.ownerViewsEarly
      : (row.ownerViewsRecent > 0 ? 1 : 0);

    clusters.push({
      clusterId: row.clusterId,
      label: row.label,
      keywords: keywordsResult.value,
      videos: row.videos,
      ownerViewsTotal: round(row.ownerViewsTotal),
      competitorViewsTotal: round(row.competitorViewsTotal),
      ownerShare: round(clamp(row.ownerViewsTotal / ownerTotalViews, 0, 1)),
      nicheShare: round(clamp((row.ownerViewsTotal + row.competitorViewsTotal) / nicheTotalViews, 0, 1)),
      trendDirection: toTrendDirection(trendDelta),
      trendDelta: round(trendDelta),
    });
  }

  const gaps: TopicGapItemDTO[] = [];
  for (const row of parsedGapRows) {
    const keywordsResult = parseKeywordsJson(row.keywordsJson, {
      channelId: input.channelId,
      clusterId: row.clusterId,
    });
    if (!keywordsResult.ok) {
      return keywordsResult;
    }

    gaps.push({
      clusterId: row.clusterId,
      label: row.label,
      keywords: keywordsResult.value,
      ownerCoverage: round(clamp(row.ownerCoverage, 0, 1)),
      nichePressure: round(Math.max(0, row.nichePressure)),
      gapScore: round(Math.max(0, row.gapScore)),
      cannibalizationRisk: round(clamp(row.cannibalizationRisk, 0, 1)),
      trendDirection: row.trendDirection,
      confidence: row.confidence,
      rationale: row.rationale,
    });
  }

  return ok({
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    totalClusters: parsedClusterRows.length,
    generatedAt: parsedGapRows[0]?.calculatedAt ?? generatedAtFallback,
    clusters,
    gaps,
  });
}
