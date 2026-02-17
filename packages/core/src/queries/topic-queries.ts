import type Database from 'better-sqlite3';
import { AppError, err, ok, type TopicConfidence, type TopicTrendDirection, type Result } from '@moze/shared';

export interface TopicVideoAggregateRow {
  videoId: string;
  title: string;
  description: string;
  viewsTotal: number;
  viewsEarly: number;
  viewsRecent: number;
}

export interface TopicVideoDayRow {
  videoId: string;
  date: string;
  views: number;
}

export interface TopicCompetitorSummaryRow {
  totalViews: number;
  competitorCount: number;
}

export interface TopicPersistedClusterRow {
  clusterId: string;
  label: string;
  keywordsJson: string;
  videos: number;
  ownerViewsTotal: number;
  ownerViewsEarly: number;
  ownerViewsRecent: number;
  competitorViewsTotal: number;
}

export interface TopicPersistedGapRow {
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

export interface TopicQueries {
  listVideoAggregates: (input: {
    channelId: string;
    dateFrom: string;
    dateTo: string;
    splitDate: string;
  }) => Result<TopicVideoAggregateRow[], AppError>;
  listVideoDays: (input: { channelId: string; dateFrom: string; dateTo: string }) => Result<TopicVideoDayRow[], AppError>;
  getCompetitorSummary: (input: {
    channelId: string;
    dateFrom: string;
    dateTo: string;
  }) => Result<TopicCompetitorSummaryRow, AppError>;
  listPersistedClusters: (input: {
    channelId: string;
    dateFrom: string;
    dateTo: string;
    splitDate: string;
  }) => Result<TopicPersistedClusterRow[], AppError>;
  listPersistedGaps: (input: {
    channelId: string;
    dateFrom: string;
    dateTo: string;
    gapLimit: number;
  }) => Result<TopicPersistedGapRow[], AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

export function createTopicQueries(db: Database.Database): TopicQueries {
  const listVideoAggregatesStmt = db.prepare<
    { channelId: string; dateFrom: string; dateTo: string; splitDate: string },
    TopicVideoAggregateRow
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
  );

  const listVideoDaysStmt = db.prepare<{ channelId: string; dateFrom: string; dateTo: string }, TopicVideoDayRow>(
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
  );

  const getCompetitorSummaryStmt = db.prepare<
    { channelId: string; dateFrom: string; dateTo: string },
    TopicCompetitorSummaryRow
  >(
    `
      SELECT
        COALESCE(SUM(views), 0) AS totalViews,
        COUNT(DISTINCT competitor_channel_id) AS competitorCount
      FROM fact_competitor_day
      WHERE channel_id = @channelId
        AND date BETWEEN @dateFrom AND @dateTo
    `,
  );

  const listPersistedClustersStmt = db.prepare<
    { channelId: string; dateFrom: string; dateTo: string; splitDate: string },
    TopicPersistedClusterRow
  >(
    `
      SELECT
        c.cluster_id AS clusterId,
        c.label AS label,
        c.keywords_json AS keywordsJson,
        c.sample_size AS videos,
        COALESCE(SUM(p.owner_views), 0) AS ownerViewsTotal,
        COALESCE(SUM(CASE WHEN p.date < @splitDate THEN p.owner_views ELSE 0 END), 0) AS ownerViewsEarly,
        COALESCE(SUM(CASE WHEN p.date >= @splitDate THEN p.owner_views ELSE 0 END), 0) AS ownerViewsRecent,
        COALESCE(SUM(p.competitor_views), 0) AS competitorViewsTotal
      FROM dim_topic_cluster AS c
      LEFT JOIN fact_topic_pressure_day AS p
        ON p.channel_id = c.channel_id
        AND p.cluster_id = c.cluster_id
        AND p.date BETWEEN @dateFrom AND @dateTo
      WHERE c.channel_id = @channelId
      GROUP BY c.cluster_id, c.label, c.keywords_json, c.sample_size
      HAVING ownerViewsTotal > 0 OR competitorViewsTotal > 0
      ORDER BY ownerViewsTotal DESC, c.cluster_id ASC
    `,
  );

  const listPersistedGapsStmt = db.prepare<
    { channelId: string; dateFrom: string; dateTo: string; gapLimit: number },
    TopicPersistedGapRow
  >(
    `
      SELECT
        g.cluster_id AS clusterId,
        c.label AS label,
        c.keywords_json AS keywordsJson,
        g.owner_coverage AS ownerCoverage,
        g.niche_pressure AS nichePressure,
        g.gap_score AS gapScore,
        g.cannibalization_risk AS cannibalizationRisk,
        g.trend_direction AS trendDirection,
        g.confidence AS confidence,
        g.rationale AS rationale,
        g.calculated_at AS calculatedAt
      FROM agg_topic_gaps AS g
      INNER JOIN dim_topic_cluster AS c
        ON c.channel_id = g.channel_id
        AND c.cluster_id = g.cluster_id
      WHERE g.channel_id = @channelId
        AND g.date_from = @dateFrom
        AND g.date_to = @dateTo
        AND g.gap_score > 0
      ORDER BY g.gap_score DESC, g.cluster_id ASC
      LIMIT @gapLimit
    `,
  );

  return {
    listVideoAggregates: (input) => {
      try {
        return ok(
          listVideoAggregatesStmt.all({
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            splitDate: input.splitDate,
          }),
        );
      } catch (cause) {
        return err(
          AppError.create(
            'DB_TOPIC_VIDEO_AGGREGATES_READ_FAILED',
            'Nie udalo sie odczytac agregatow video dla Topic Intelligence.',
            'error',
            {
              channelId: input.channelId,
              dateFrom: input.dateFrom,
              dateTo: input.dateTo,
              splitDate: input.splitDate,
            },
            toError(cause),
          ),
        );
      }
    },

    listVideoDays: (input) => {
      try {
        return ok(
          listVideoDaysStmt.all({
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
          }),
        );
      } catch (cause) {
        return err(
          AppError.create(
            'DB_TOPIC_VIDEO_DAYS_READ_FAILED',
            'Nie udalo sie odczytac dziennych danych video dla Topic Intelligence.',
            'error',
            { channelId: input.channelId, dateFrom: input.dateFrom, dateTo: input.dateTo },
            toError(cause),
          ),
        );
      }
    },

    getCompetitorSummary: (input) => {
      try {
        return ok(
          getCompetitorSummaryStmt.get({
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
          }) ?? { totalViews: 0, competitorCount: 0 },
        );
      } catch (cause) {
        return err(
          AppError.create(
            'DB_TOPIC_COMPETITOR_SUMMARY_READ_FAILED',
            'Nie udalo sie odczytac podsumowania konkurencji dla Topic Intelligence.',
            'error',
            { channelId: input.channelId, dateFrom: input.dateFrom, dateTo: input.dateTo },
            toError(cause),
          ),
        );
      }
    },

    listPersistedClusters: (input) => {
      try {
        return ok(
          listPersistedClustersStmt.all({
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            splitDate: input.splitDate,
          }),
        );
      } catch (cause) {
        return err(
          AppError.create(
            'DB_TOPIC_PERSISTED_CLUSTERS_READ_FAILED',
            'Nie udalo sie odczytac zapisanych klastrow topic.',
            'error',
            {
              channelId: input.channelId,
              dateFrom: input.dateFrom,
              dateTo: input.dateTo,
              splitDate: input.splitDate,
            },
            toError(cause),
          ),
        );
      }
    },

    listPersistedGaps: (input) => {
      try {
        return ok(
          listPersistedGapsStmt.all({
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            gapLimit: input.gapLimit,
          }),
        );
      } catch (cause) {
        return err(
          AppError.create(
            'DB_TOPIC_PERSISTED_GAPS_READ_FAILED',
            'Nie udalo sie odczytac zapisanych luk topic.',
            'error',
            {
              channelId: input.channelId,
              dateFrom: input.dateFrom,
              dateTo: input.dateTo,
              gapLimit: input.gapLimit,
            },
            toError(cause),
          ),
        );
      }
    },
  };
}
