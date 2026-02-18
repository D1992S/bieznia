import {
  createCompetitorQueries,
  createCompetitorRepository,
  type DatabaseConnection,
} from '@moze/core';
import {
  AppError,
  err,
  ok,
  type CompetitorInsightsResultDTO,
  type CompetitorSyncResultDTO,
  type Result,
} from '@moze/shared';
import { z } from 'zod/v4';

interface OwnerDayRow {
  date: string;
  subscribers: number;
  views: number;
  videos: number;
}

interface CompetitorBaseProfile {
  competitorChannelId: string;
  name: string;
  handle: string;
  viewsFactor: number;
  viewsTrend: number;
  subscribersFactor: number;
  subscribersTrend: number;
  videosFactor: number;
  videosTrend: number;
}

interface CompetitorSnapshotRow {
  competitorChannelId: string;
  name: string;
  handle: string | null;
  date: string;
  subscribers: number;
  views: number;
  videos: number;
}

export interface SyncCompetitorSnapshotsInput {
  db: DatabaseConnection['db'];
  channelId: string;
  dateFrom: string;
  dateTo: string;
  competitorCount?: number;
  now?: () => Date;
}

export interface GetCompetitorInsightsInput {
  db: DatabaseConnection['db'];
  channelId: string;
  dateFrom: string;
  dateTo: string;
  limit?: number;
  now?: () => Date;
}

const OWNER_DAY_ROW_SCHEMA = z.object({
  date: z.iso.date(),
  subscribers: z.number().nonnegative(),
  views: z.number().nonnegative(),
  videos: z.number().nonnegative(),
});

const COMPETITOR_SNAPSHOT_ROW_SCHEMA = z.object({
  competitorChannelId: z.string().min(1),
  name: z.string().min(1),
  handle: z.string().min(1).nullable(),
  date: z.iso.date(),
  subscribers: z.number().nonnegative(),
  views: z.number().nonnegative(),
  videos: z.number().nonnegative(),
});

const DEFAULT_COMPETITOR_PROFILES: ReadonlyArray<CompetitorBaseProfile> = [
  {
    competitorChannelId: 'UC-COMP-ALFA',
    name: 'Kanał Alfa',
    handle: '@kanal_alfa',
    viewsFactor: 1.08,
    viewsTrend: 0.22,
    subscribersFactor: 1.03,
    subscribersTrend: 0.18,
    videosFactor: 0.98,
    videosTrend: 0.11,
  },
  {
    competitorChannelId: 'UC-COMP-BETA',
    name: 'Kanał Beta',
    handle: '@kanal_beta',
    viewsFactor: 0.94,
    viewsTrend: 0.15,
    subscribersFactor: 0.99,
    subscribersTrend: 0.12,
    videosFactor: 1.12,
    videosTrend: 0.16,
  },
  {
    competitorChannelId: 'UC-COMP-GAMMA',
    name: 'Kanał Gamma',
    handle: '@kanal_gamma',
    viewsFactor: 1.17,
    viewsTrend: 0.29,
    subscribersFactor: 1.09,
    subscribersTrend: 0.24,
    videosFactor: 1.04,
    videosTrend: 0.08,
  },
  {
    competitorChannelId: 'UC-COMP-DELTA',
    name: 'Kanał Delta',
    handle: '@kanal_delta',
    viewsFactor: 0.88,
    viewsTrend: 0.09,
    subscribersFactor: 0.93,
    subscribersTrend: 0.07,
    videosFactor: 1.22,
    videosTrend: 0.18,
  },
  {
    competitorChannelId: 'UC-COMP-OMEGA',
    name: 'Kanał Omega',
    handle: '@kanal_omega',
    viewsFactor: 1.26,
    viewsTrend: 0.31,
    subscribersFactor: 1.15,
    subscribersTrend: 0.28,
    videosFactor: 0.95,
    videosTrend: 0.05,
  },
];

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
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

function createCompetitorError(
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
      createCompetitorError(
        'COMPETITOR_INVALID_DATE_RANGE',
        'Data poczatkowa nie moze byc pozniejsza niz koncowa.',
        { dateFrom, dateTo },
      ),
    );
  }
  return ok(undefined);
}

function readOwnerDayRows(
  db: DatabaseConnection['db'],
  channelId: string,
  dateFrom: string,
  dateTo: string,
): Result<OwnerDayRow[], AppError> {
  const competitorQueries = createCompetitorQueries(db);
  const rowsResult = competitorQueries.listOwnerDayRows({ channelId, dateFrom, dateTo });
  if (!rowsResult.ok) {
    return err(
      createCompetitorError(
        'COMPETITOR_OWNER_READ_FAILED',
        'Failed to read channel data for competitor analysis.',
        { channelId, dateFrom, dateTo, causeErrorCode: rowsResult.error.code },
        rowsResult.error,
      ),
    );
  }

  const parsedRows: OwnerDayRow[] = [];
  for (let index = 0; index < rowsResult.value.length; index += 1) {
    const parsed = OWNER_DAY_ROW_SCHEMA.safeParse(rowsResult.value[index]);
    if (!parsed.success) {
      return err(
        createCompetitorError(
          'COMPETITOR_OWNER_ROW_INVALID',
          'Channel data for competitor analysis has an invalid format.',
          { channelId, dateFrom, dateTo, rowIndex: index, issues: parsed.error.issues },
        ),
      );
    }
    parsedRows.push(parsed.data);
  }

  return ok(parsedRows);
}
function buildCompetitorProfiles(count: number): CompetitorBaseProfile[] {
  if (count <= DEFAULT_COMPETITOR_PROFILES.length) {
    return DEFAULT_COMPETITOR_PROFILES.slice(0, count);
  }

  const profiles = [...DEFAULT_COMPETITOR_PROFILES];
  let index = profiles.length;
  while (index < count) {
    const sequence = index + 1;
    profiles.push({
      competitorChannelId: `UC-COMP-${String(sequence).padStart(3, '0')}`,
      name: `Kanał ${sequence}`,
      handle: `@kanal_${sequence}`,
      viewsFactor: 0.9 + (sequence % 5) * 0.08,
      viewsTrend: 0.07 + (sequence % 7) * 0.03,
      subscribersFactor: 0.92 + (sequence % 4) * 0.05,
      subscribersTrend: 0.06 + (sequence % 6) * 0.025,
      videosFactor: 0.95 + (sequence % 3) * 0.09,
      videosTrend: 0.05 + (sequence % 5) * 0.02,
    });
    index += 1;
  }

  return profiles;
}

function buildSnapshot(
  input: {
    ownerRow: OwnerDayRow;
    profile: CompetitorBaseProfile;
    dayIndex: number;
    dayCount: number;
    competitorIndex: number;
  },
): CompetitorSnapshotRow {
  const progress = input.dayCount <= 1 ? 0 : input.dayIndex / (input.dayCount - 1);
  const wave = 1 + Math.sin((input.dayIndex + input.competitorIndex * 3) / 4) * 0.08;
  const waveSubscribers = 1 + Math.cos((input.dayIndex + input.competitorIndex * 2) / 5) * 0.04;

  const views = Math.max(
    0,
    Math.round(input.ownerRow.views * input.profile.viewsFactor * (1 + input.profile.viewsTrend * progress) * wave),
  );
  const subscribers = Math.max(
    0,
    Math.round(
      input.ownerRow.subscribers
      * input.profile.subscribersFactor
      * (1 + input.profile.subscribersTrend * progress)
      * waveSubscribers,
    ),
  );
  const videos = Math.max(
    0,
    Math.round(
      input.ownerRow.videos * input.profile.videosFactor
      + input.dayIndex * input.profile.videosTrend
      + input.competitorIndex * 0.2,
    ),
  );

  return {
    competitorChannelId: input.profile.competitorChannelId,
    name: input.profile.name,
    handle: input.profile.handle,
    date: input.ownerRow.date,
    subscribers,
    views,
    videos,
  };
}

function calculateGrowthRate(firstValue: number, lastValue: number): number {
  if (firstValue <= 0) {
    return lastValue > 0 ? 1 : 0;
  }
  return (lastValue - firstValue) / firstValue;
}

function calculateUploadsPerWeek(firstVideos: number, lastVideos: number, daysWithData: number): number {
  if (daysWithData <= 1) {
    return 0;
  }
  const uploads = Math.max(0, lastVideos - firstVideos);
  return (uploads / (daysWithData - 1)) * 7;
}

function calculateMean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

function calculateStdDeviation(values: readonly number[], mean: number): number {
  if (values.length <= 1) {
    return 0;
  }
  let sum = 0;
  for (const value of values) {
    const diff = value - mean;
    sum += diff * diff;
  }
  return Math.sqrt(sum / values.length);
}

export function syncCompetitorSnapshots(input: SyncCompetitorSnapshotsInput): Result<CompetitorSyncResultDTO, AppError> {
  const now = input.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const competitorCount = input.competitorCount ?? 3;

  const rangeValidation = validateDateRange(input.dateFrom, input.dateTo);
  if (!rangeValidation.ok) {
    return rangeValidation;
  }

  const ownerRowsResult = readOwnerDayRows(input.db, input.channelId, input.dateFrom, input.dateTo);
  if (!ownerRowsResult.ok) {
    return ownerRowsResult;
  }

  if (ownerRowsResult.value.length === 0) {
    return err(
      createCompetitorError(
        'COMPETITOR_SYNC_SOURCE_EMPTY',
        'Brak danych kanalu w wybranym zakresie do synchronizacji konkurencji.',
        {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        },
      ),
    );
  }

  const profiles = buildCompetitorProfiles(competitorCount);
  const competitorQueries = createCompetitorQueries(input.db);
  const competitorRepository = createCompetitorRepository(input.db);

  try {
    const counters = {
      snapshotsProcessed: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
    };

    const runTxResult = competitorRepository.runInTransaction(() => {
      const previousByCompetitor = new Map<string, { subscribers: number; views: number; videos: number }>();

      for (let competitorIndex = 0; competitorIndex < profiles.length; competitorIndex += 1) {
        const profile = profiles[competitorIndex];
        if (!profile) {
          continue;
        }

        const upsertCompetitorResult = competitorRepository.upsertCompetitorProfile({
          channelId: input.channelId,
          competitorChannelId: profile.competitorChannelId,
          name: profile.name,
          handle: profile.handle,
          nowIso: generatedAt,
        });
        if (!upsertCompetitorResult.ok) {
          return upsertCompetitorResult;
        }

        for (let dayIndex = 0; dayIndex < ownerRowsResult.value.length; dayIndex += 1) {
          const ownerRow = ownerRowsResult.value[dayIndex];
          if (!ownerRow) {
            continue;
          }

          counters.snapshotsProcessed += 1;
          const snapshot = buildSnapshot({
            ownerRow,
            profile,
            dayIndex,
            dayCount: ownerRowsResult.value.length,
            competitorIndex,
          });

          const parsedSnapshot = COMPETITOR_SNAPSHOT_ROW_SCHEMA.safeParse(snapshot);
          if (!parsedSnapshot.success) {
            throw new Error(
              `COMPETITOR_SNAPSHOT_INVALID: channelId=${input.channelId}; competitorChannelId=${profile.competitorChannelId}; date=${ownerRow.date}; issues=${JSON.stringify(parsedSnapshot.error.issues)}`,
            );
          }

          const previous = previousByCompetitor.get(parsedSnapshot.data.competitorChannelId);
          const subscribersDelta = previous
            ? parsedSnapshot.data.subscribers - previous.subscribers
            : 0;
          const viewsDelta = previous
            ? parsedSnapshot.data.views - previous.views
            : 0;
          const videosDelta = previous
            ? parsedSnapshot.data.videos - previous.videos
            : 0;

          previousByCompetitor.set(parsedSnapshot.data.competitorChannelId, {
            subscribers: parsedSnapshot.data.subscribers,
            views: parsedSnapshot.data.views,
            videos: parsedSnapshot.data.videos,
          });

          const persistedResult = competitorQueries.getPersistedSnapshot({
            channelId: input.channelId,
            competitorChannelId: parsedSnapshot.data.competitorChannelId,
            date: parsedSnapshot.data.date,
          });
          if (!persistedResult.ok) {
            return persistedResult;
          }
          const persisted = persistedResult.value;

          if (
            persisted
            && persisted.subscribers === parsedSnapshot.data.subscribers
            && persisted.views === parsedSnapshot.data.views
            && persisted.videos === parsedSnapshot.data.videos
            && persisted.subscribersDelta === subscribersDelta
            && persisted.viewsDelta === viewsDelta
            && persisted.videosDelta === videosDelta
          ) {
            counters.unchanged += 1;
            continue;
          }

          const upsertSnapshotResult = competitorRepository.upsertSnapshot({
            channelId: input.channelId,
            competitorChannelId: parsedSnapshot.data.competitorChannelId,
            date: parsedSnapshot.data.date,
            subscribers: parsedSnapshot.data.subscribers,
            views: parsedSnapshot.data.views,
            videos: parsedSnapshot.data.videos,
            subscribersDelta,
            viewsDelta,
            videosDelta,
            nowIso: generatedAt,
          });
          if (!upsertSnapshotResult.ok) {
            return upsertSnapshotResult;
          }

          if (persisted) {
            counters.updated += 1;
          } else {
            counters.inserted += 1;
          }
        }
      }
      return ok(undefined);
    });
    if (!runTxResult.ok) {
      return err(
        createCompetitorError(
          'COMPETITOR_SYNC_FAILED',
          'Nie udalo sie zsynchronizowac danych konkurencji.',
          {
            channelId: input.channelId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            competitorCount,
            causeErrorCode: runTxResult.error.code,
          },
          runTxResult.error,
        ),
      );
    }

    return ok({
      channelId: input.channelId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      competitorsSynced: profiles.length,
      snapshotsProcessed: counters.snapshotsProcessed,
      inserted: counters.inserted,
      updated: counters.updated,
      unchanged: counters.unchanged,
      generatedAt,
    });
  } catch (cause) {
    return err(
      createCompetitorError(
        'COMPETITOR_SYNC_FAILED',
        'Nie udalo sie zsynchronizowac danych konkurencji.',
        {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          competitorCount,
        },
        cause,
      ),
    );
  }
}

export function getCompetitorInsights(input: GetCompetitorInsightsInput): Result<CompetitorInsightsResultDTO, AppError> {
  const now = input.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const limit = input.limit ?? 10;

  const rangeValidation = validateDateRange(input.dateFrom, input.dateTo);
  if (!rangeValidation.ok) {
    return rangeValidation;
  }

  const ownerRowsResult = readOwnerDayRows(input.db, input.channelId, input.dateFrom, input.dateTo);
  if (!ownerRowsResult.ok) {
    return ownerRowsResult;
  }

  if (ownerRowsResult.value.length === 0) {
    return err(
      createCompetitorError(
        'COMPETITOR_INSIGHTS_SOURCE_EMPTY',
        'Brak danych kanalu w wybranym zakresie do porownania z konkurencja.',
        {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        },
      ),
    );
  }

  const ownerFirst = ownerRowsResult.value[0];
  const ownerLast = ownerRowsResult.value[ownerRowsResult.value.length - 1];
  if (!ownerFirst || !ownerLast) {
    return err(
      createCompetitorError(
        'COMPETITOR_OWNER_RANGE_INVALID',
        'Nie udalo sie policzyc benchmarku kanalu dla konkurencji.',
        {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        },
      ),
    );
  }

  const ownerTotalViews = ownerRowsResult.value.reduce((sum, row) => sum + row.views, 0);
  const ownerGrowthRate = calculateGrowthRate(ownerFirst.views, ownerLast.views);
  const ownerUploadsPerWeek = calculateUploadsPerWeek(ownerFirst.videos, ownerLast.videos, ownerRowsResult.value.length);  const competitorQueries = createCompetitorQueries(input.db);
  const snapshotRowsResult = competitorQueries.listSnapshotsInRange({
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });
  if (!snapshotRowsResult.ok) {
    return err(
      createCompetitorError(
        'COMPETITOR_INSIGHTS_READ_FAILED',
        'Nie udalo sie odczytac danych konkurencji.',
        {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          causeErrorCode: snapshotRowsResult.error.code,
        },
        snapshotRowsResult.error,
      ),
    );
  }

  const snapshotRows = snapshotRowsResult.value;

  const validRows: CompetitorSnapshotRow[] = [];
  for (let index = 0; index < snapshotRows.length; index += 1) {
    const parsed = COMPETITOR_SNAPSHOT_ROW_SCHEMA.safeParse(snapshotRows[index]);
    if (!parsed.success) {
      return err(
        createCompetitorError(
          'COMPETITOR_INSIGHTS_ROW_INVALID',
          'Dane konkurencji maja niepoprawny format.',
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
    validRows.push(parsed.data);
  }

  const grouped = new Map<string, CompetitorSnapshotRow[]>();
  for (const row of validRows) {
    const existing = grouped.get(row.competitorChannelId);
    if (existing) {
      existing.push(row);
      continue;
    }
    grouped.set(row.competitorChannelId, [row]);
  }

  const hits: CompetitorInsightsResultDTO['hits'] = [];
  const items: CompetitorInsightsResultDTO['items'] = [];
  const totalCompetitorsViews = Array.from(grouped.values()).reduce(
    (sum, rows) => sum + rows.reduce((rowSum, row) => rowSum + row.views, 0),
    0,
  );

  for (const [competitorChannelId, rows] of grouped.entries()) {
    if (rows.length === 0) {
      continue;
    }

    const first = rows[0];
    const last = rows[rows.length - 1];
    if (!first || !last) {
      continue;
    }

    const totalViews = rows.reduce((sum, row) => sum + row.views, 0);
    const avgViewsPerDay = totalViews / rows.length;
    const competitorGrowthRate = calculateGrowthRate(first.views, last.views);
    const relativeGrowth = competitorGrowthRate - ownerGrowthRate;
    const uploadsPerWeek = calculateUploadsPerWeek(first.videos, last.videos, rows.length);
    const uploadFrequencyDelta = uploadsPerWeek - ownerUploadsPerWeek;
    const marketShare = totalCompetitorsViews + ownerTotalViews > 0
      ? totalViews / (totalCompetitorsViews + ownerTotalViews)
      : 0;

    const viewSeries = rows.map((row) => row.views);
    const meanViews = calculateMean(viewSeries);
    const stdViews = calculateStdDeviation(viewSeries, meanViews);
    const hitThreshold = meanViews + stdViews * 3;
    const competitorHits: CompetitorInsightsResultDTO['hits'] = [];
    for (const row of rows) {
      if (stdViews <= 0 || row.views <= hitThreshold) {
        continue;
      }
      const zScore = (row.views - meanViews) / stdViews;
      const hitItem = {
        competitorChannelId,
        competitorName: row.name,
        date: row.date,
        views: row.views,
        threshold: round(hitThreshold),
        zScore: round(zScore),
      };
      competitorHits.push(hitItem);
      hits.push(hitItem);
    }

    const splitIndex = rows.length <= 2 ? 1 : Math.floor(rows.length * 0.5);
    const historicalSlice = rows.slice(0, splitIndex);
    const recentSlice = rows.slice(splitIndex);
    const historicalAvg = calculateMean(historicalSlice.map((row) => row.views));
    const recentAvg = calculateMean((recentSlice.length > 0 ? recentSlice : rows).map((row) => row.views));
    const recentLift = historicalAvg > 0 ? (recentAvg - historicalAvg) / historicalAvg : (recentAvg > 0 ? 1 : 0);
    const topHitScore = competitorHits.reduce((maxValue, hit) => Math.max(maxValue, hit.zScore), 0);
    const hitBoost = clamp(topHitScore / 6, 0, 1);
    const momentumScore = clamp(
      50 + recentLift * 35 + relativeGrowth * 25 + hitBoost * 15,
      0,
      100,
    );

    items.push({
      competitorChannelId,
      name: first.name,
      handle: first.handle,
      daysWithData: rows.length,
      totalViews: round(totalViews),
      avgViewsPerDay: round(avgViewsPerDay),
      marketShare: round(clamp(marketShare, 0, 1)),
      relativeGrowth: round(relativeGrowth),
      uploadsPerWeek: round(Math.max(0, uploadsPerWeek)),
      uploadFrequencyDelta: round(uploadFrequencyDelta),
      momentumScore: round(momentumScore),
      hitCount: competitorHits.length,
      lastHitDate: competitorHits.length > 0 ? competitorHits[competitorHits.length - 1]?.date ?? null : null,
    });
  }

  const sortedItems = [...items].sort((a, b) =>
    b.momentumScore - a.momentumScore
    || b.hitCount - a.hitCount
    || b.totalViews - a.totalViews
    || a.competitorChannelId.localeCompare(b.competitorChannelId));
  const sortedHits = [...hits].sort((a, b) =>
    b.zScore - a.zScore
    || b.views - a.views
    || a.date.localeCompare(b.date));

  return ok({
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    totalCompetitors: grouped.size,
    generatedAt,
    ownerBenchmark: {
      totalViews: round(ownerTotalViews),
      avgViewsPerDay: round(ownerTotalViews / ownerRowsResult.value.length),
      growthRate: round(ownerGrowthRate),
      uploadsPerWeek: round(Math.max(0, ownerUploadsPerWeek)),
    },
    items: sortedItems.slice(0, limit),
    hits: sortedHits.slice(0, 30),
  });
}
