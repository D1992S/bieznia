import type { DatabaseConnection } from '@moze/core';
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
        'Data początkowa nie może być późniejsza niż końcowa.',
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
  let videoRows: VideoAggregateRow[] = [];
  let videoDayRows: VideoDayRow[] = [];
  let competitorSummary: CompetitorSummaryRow = { totalViews: 0, competitorCount: 0 };

  try {
    videoRows = input.db.prepare<
      { channelId: string; dateFrom: string; dateTo: string; splitDate: string },
      VideoAggregateRow
    >(
      `
        SELECT
          v.video_id AS videoId,
          v.title AS title,
          v.description AS description,
          SUM(f.views) AS viewsTotal,
          SUM(CASE WHEN f.date < @splitDate THEN f.views ELSE 0 END) AS viewsEarly,
          SUM(CASE WHEN f.date >= @splitDate THEN f.views ELSE 0 END) AS viewsRecent
        FROM fact_video_day AS f
        INNER JOIN dim_video AS v
          ON v.video_id = f.video_id
        WHERE f.channel_id = @channelId
          AND f.date BETWEEN @dateFrom AND @dateTo
        GROUP BY v.video_id, v.title, v.description
        ORDER BY v.video_id ASC
      `,
    ).all({
      channelId: input.channelId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      splitDate,
    });

    videoDayRows = input.db.prepare<
      { channelId: string; dateFrom: string; dateTo: string },
      VideoDayRow
    >(
      `
        SELECT
          video_id AS videoId,
          date,
          views
        FROM fact_video_day
        WHERE channel_id = @channelId
          AND date BETWEEN @dateFrom AND @dateTo
        ORDER BY video_id ASC, date ASC
      `,
    ).all({
      channelId: input.channelId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });

    const competitorRow = input.db.prepare<
      { channelId: string; dateFrom: string; dateTo: string },
      CompetitorSummaryRow
    >(
      `
        SELECT
          COALESCE(SUM(views), 0) AS totalViews,
          COUNT(DISTINCT competitor_channel_id) AS competitorCount
        FROM fact_competitor_day
        WHERE channel_id = @channelId
          AND date BETWEEN @dateFrom AND @dateTo
      `,
    ).get({
      channelId: input.channelId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });

    competitorSummary = competitorRow ?? { totalViews: 0, competitorCount: 0 };
  } catch (cause) {
    return err(
      createTopicError(
        'TOPIC_INTELLIGENCE_READ_FAILED',
        'Nie udało się odczytać danych wejściowych Topic Intelligence.',
        { channelId: input.channelId, dateFrom: input.dateFrom, dateTo: input.dateTo },
        cause,
      ),
    );
  }

  for (let index = 0; index < videoRows.length; index += 1) {
    if (!VIDEO_AGGREGATE_SCHEMA.safeParse(videoRows[index]).success) {
      return err(
        createTopicError(
          'TOPIC_INTELLIGENCE_VIDEO_INVALID',
          'Dane filmów mają niepoprawny format.',
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
          'Dane dzienne filmów mają niepoprawny format.',
          { rowIndex: index },
        ),
      );
    }
  }

  if (videoRows.length === 0) {
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

  try {
    const upsertClusterStmt = input.db.prepare<{
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

    const deleteGapsStmt = input.db.prepare<{ channelId: string; dateFrom: string; dateTo: string }>(
      `
        DELETE FROM agg_topic_gaps
        WHERE channel_id = @channelId
          AND date_from = @dateFrom
          AND date_to = @dateTo
      `,
    );

    const deletePressureStmt = input.db.prepare<{ channelId: string; dateFrom: string; dateTo: string }>(
      `
        DELETE FROM fact_topic_pressure_day
        WHERE channel_id = @channelId
          AND date BETWEEN @dateFrom AND @dateTo
      `,
    );

    const insertGapStmt = input.db.prepare<{
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

    const upsertPressureStmt = input.db.prepare<{
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

    const tx = input.db.transaction(() => {
      deleteGapsStmt.run({
        channelId: input.channelId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      });

      deletePressureStmt.run({
        channelId: input.channelId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      });

      for (const cluster of clusters) {
        upsertClusterStmt.run({
          channelId: input.channelId,
          clusterId: cluster.clusterId,
          label: cluster.label,
          keywordsJson: JSON.stringify(sortedKeywords(cluster.keywordsMap)),
          sampleSize: cluster.videoIds.size,
          nowIso: generatedAt,
        });

        insertGapStmt.run({
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
      }

      for (const row of pressureRows) {
        upsertPressureStmt.run({
          channelId: input.channelId,
          clusterId: row.clusterId,
          date: row.date,
          ownerViews: Math.max(0, Math.round(row.ownerViews)),
          competitorViews: Math.max(0, Math.round(row.competitorViews)),
          pressureScore: Math.max(0, row.pressureScore),
          trendDirection: row.trendDirection,
          updatedAt: row.updatedAt,
        });
      }
    });

    tx();
  } catch (cause) {
    return err(
      createTopicError(
        'TOPIC_INTELLIGENCE_PERSIST_FAILED',
        'Nie udało się zapisać wyników Topic Intelligence.',
        { channelId: input.channelId, dateFrom: input.dateFrom, dateTo: input.dateTo },
        cause,
      ),
    );
  }

  return ok(result);
}

export function getTopicIntelligence(input: GetTopicIntelligenceInput): Result<TopicIntelligenceResultDTO, AppError> {
  return runTopicIntelligence({
    db: input.db,
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    clusterLimit: input.clusterLimit,
    gapLimit: input.gapLimit,
    now: input.now,
  });
}
