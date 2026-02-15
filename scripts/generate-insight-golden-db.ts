import fs from 'node:fs';
import path from 'node:path';
import {
  createCoreRepository,
  createDatabaseConnection,
  runMigrations,
  type UpsertChannelDayInput,
  type UpsertChannelInput,
  type UpsertVideoDayInput,
  type UpsertVideoInput,
} from '../packages/core/src/index.ts';
import { runDataPipeline } from '../packages/data-pipeline/src/index.ts';
import { runAnomalyTrendAnalysis, runMlBaseline } from '../packages/ml/src/index.ts';

const OUTPUT_DB_PATH = path.resolve(process.cwd(), 'fixtures', 'insight_golden.db');
const START_DATE = '2025-08-01';
const DAY_COUNT = 90;
const FIXED_NOW_ISO = '2026-01-15T10:00:00.000Z';
const FIXED_NOW = () => new Date(FIXED_NOW_ISO);

interface ChannelSeedConfig {
  channelId: string;
  profileId: string;
  name: string;
  description: string;
  seed: number;
  baseViews: number;
  trendPerDay: number;
  seasonalAmplitude: number;
  noiseScale: number;
  subscriberStart: number;
  subscriberDivider: number;
  subscriberDrift: number;
  publishDays: number[];
  missingDays: Set<number>;
  spikes: Record<number, number>;
  keywords: string[];
}

interface GeneratedChannelData {
  channel: UpsertChannelInput;
  videos: UpsertVideoInput[];
  channelDays: UpsertChannelDayInput[];
  videoDays: UpsertVideoDayInput[];
}

function isoDateFromOffset(dayOffset: number): string {
  const base = new Date(`${START_DATE}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + dayOffset);
  return base.toISOString().slice(0, 10);
}

function isoDateTimeFromOffset(dayOffset: number, hour = 12): string {
  return `${isoDateFromOffset(dayOffset)}T${String(hour).padStart(2, '0')}:00:00.000Z`;
}

function deterministicNoise(day: number, seed: number): number {
  const value = ((day * 17 + seed * 31) % 23) - 11;
  return value;
}

function createChannelSeries(config: ChannelSeedConfig): GeneratedChannelData {
  const channelDays: UpsertChannelDayInput[] = [];
  const videos: UpsertVideoInput[] = [];
  const videoDays: UpsertVideoDayInput[] = [];

  let subscribers = config.subscriberStart;
  let totalViews = 0;

  for (let day = 0; day < DAY_COUNT; day += 1) {
    if (config.missingDays.has(day)) {
      continue;
    }

    const seasonal = Math.sin(((day + config.seed) / 7) * Math.PI * 2) * config.seasonalAmplitude;
    const noise = deterministicNoise(day, config.seed) * config.noiseScale;
    let dailyViews = config.baseViews + config.trendPerDay * day + seasonal + noise;
    const spikeMultiplier = config.spikes[day];
    if (spikeMultiplier !== undefined) {
      dailyViews *= spikeMultiplier;
    }

    const views = Math.max(0, Math.round(dailyViews));
    totalViews += views;

    const subscriberChange = Math.round(views / config.subscriberDivider) + config.subscriberDrift;
    subscribers = Math.max(0, subscribers + subscriberChange);

    const publishedVideosCount = config.publishDays.filter((publishDay) => publishDay <= day).length;
    const likes = Math.max(0, Math.round(views * (0.055 + config.seed * 0.002)));
    const comments = Math.max(0, Math.round(views * (0.006 + config.seed * 0.0005)));
    const watchTimeMinutes = Math.max(
      0,
      Math.round(views * (0.34 + Math.abs(Math.sin((day + 3) / 9)) * 0.22)),
    );

    channelDays.push({
      channelId: config.channelId,
      date: isoDateFromOffset(day),
      subscribers,
      views,
      videos: publishedVideosCount,
      likes,
      comments,
      watchTimeMinutes,
      updatedAt: isoDateTimeFromOffset(day, 22),
    });
  }

  for (let index = 0; index < config.publishDays.length; index += 1) {
    const publishDay = config.publishDays[index] ?? 0;
    const videoId = `${config.channelId}-VID-${String(index + 1).padStart(3, '0')}`;
    const publishedAt = isoDateTimeFromOffset(publishDay, 18);

    const videoBase = Math.round(config.baseViews * 8 + index * 700 + config.seed * 350);
    let aggregateViews = 0;
    let aggregateLikes = 0;
    let aggregateComments = 0;

    for (let offset = 0; offset < 8; offset += 1) {
      const dayIndex = publishDay + offset;
      if (dayIndex >= DAY_COUNT || config.missingDays.has(dayIndex)) {
        continue;
      }

      const decay = 1 / (1 + offset * 0.9);
      const dayViews = Math.max(0, Math.round(videoBase * decay * 0.27));
      const dayLikes = Math.max(0, Math.round(dayViews * 0.09));
      const dayComments = Math.max(0, Math.round(dayViews * 0.012));
      const dayWatchTime = Math.max(0, Math.round(dayViews * 0.45));
      const impressions = Math.max(0, Math.round(dayViews * 5.2));
      const ctr = impressions > 0 ? dayViews / impressions : 0;

      aggregateViews += dayViews;
      aggregateLikes += dayLikes;
      aggregateComments += dayComments;

      videoDays.push({
        videoId,
        channelId: config.channelId,
        date: isoDateFromOffset(dayIndex),
        views: dayViews,
        likes: dayLikes,
        comments: dayComments,
        watchTimeMinutes: dayWatchTime,
        impressions,
        ctr,
        updatedAt: isoDateTimeFromOffset(dayIndex, 23),
      });
    }

    videos.push({
      videoId,
      channelId: config.channelId,
      title: `${config.name} - materiał ${String(index + 1)} (${config.keywords[0] ?? 'analiza'})`,
      description: `Materiał ${String(index + 1)} dla ${config.name}. Słowa kluczowe: ${config.keywords.join(', ')}.`,
      publishedAt,
      durationSeconds: 420 + index * 15,
      viewCount: aggregateViews,
      likeCount: aggregateLikes,
      commentCount: aggregateComments,
      thumbnailUrl: `https://example.com/${videoId}.jpg`,
      updatedAt: FIXED_NOW_ISO,
    });
  }

  const latestDay = channelDays[channelDays.length - 1];
  const channelSnapshotViews = totalViews;
  const channelSnapshotSubscribers = latestDay?.subscribers ?? config.subscriberStart;
  const channelSnapshotVideos = config.publishDays.filter((day) => day <= DAY_COUNT - 1).length;

  const channel: UpsertChannelInput = {
    channelId: config.channelId,
    profileId: config.profileId,
    name: config.name,
    description: config.description,
    thumbnailUrl: `https://example.com/${config.channelId}.jpg`,
    publishedAt: isoDateTimeFromOffset(0, 9),
    subscriberCount: channelSnapshotSubscribers,
    videoCount: channelSnapshotVideos,
    viewCount: channelSnapshotViews,
    lastSyncAt: isoDateTimeFromOffset(DAY_COUNT - 1, 23),
    updatedAt: FIXED_NOW_ISO,
  };

  return {
    channel,
    videos,
    channelDays,
    videoDays,
  };
}

function main(): void {
  fs.mkdirSync(path.dirname(OUTPUT_DB_PATH), { recursive: true });
  if (fs.existsSync(OUTPUT_DB_PATH)) {
    fs.unlinkSync(OUTPUT_DB_PATH);
  }

  const connectionResult = createDatabaseConnection({ filename: OUTPUT_DB_PATH });
  if (!connectionResult.ok) {
    throw new Error(connectionResult.error.message);
  }

  const connection = connectionResult.value;
  let closeError: Error | null = null;
  try {
    const migrationResult = runMigrations(connection.db);
    if (!migrationResult.ok) {
      throw new Error(migrationResult.error.message);
    }

    const repository = createCoreRepository(connection.db);

    const profileId = 'profile-golden-main';
    const profileResult = repository.upsertProfile({
      id: profileId,
      name: 'Golden Profile',
      isActive: true,
      createdAt: FIXED_NOW_ISO,
      updatedAt: FIXED_NOW_ISO,
    });
    if (!profileResult.ok) {
      throw new Error(profileResult.error.message);
    }

    const channelConfigs: ChannelSeedConfig[] = [
      {
        channelId: 'UC-GOLD-PL-001',
        profileId,
        name: 'Kanał Strategia',
        description: 'Kanał edukacyjny z mocnym trendem wzrostowym i okresowymi pikami.',
        seed: 1,
        baseViews: 3100,
        trendPerDay: 22,
        seasonalAmplitude: 540,
        noiseScale: 17,
        subscriberStart: 12500,
        subscriberDivider: 360,
        subscriberDrift: 2,
        publishDays: [0, 8, 17, 29, 41, 53, 67, 82],
        missingDays: new Set<number>(),
        spikes: { 33: 3.8, 57: 0.42 },
        keywords: ['analityka', 'strategia', 'wzrost'],
      },
      {
        channelId: 'UC-GOLD-PL-002',
        profileId,
        name: 'Kanał Shorts Lab',
        description: 'Kanał testowy z wahaniami i okresami spadkowymi.',
        seed: 2,
        baseViews: 2700,
        trendPerDay: -8,
        seasonalAmplitude: 720,
        noiseScale: 24,
        subscriberStart: 9200,
        subscriberDivider: 410,
        subscriberDrift: -1,
        publishDays: [2, 14, 25, 36, 49, 63, 78],
        missingDays: new Set<number>([12, 13, 40]),
        spikes: { 45: 2.9, 68: 0.55 },
        keywords: ['shorts', 'testy', 'eksperyment'],
      },
      {
        channelId: 'UC-GOLD-PL-003',
        profileId,
        name: 'Kanał Niszowy',
        description: 'Kanał z późnym startem danych i częściowymi brakami.',
        seed: 3,
        baseViews: 1400,
        trendPerDay: 12,
        seasonalAmplitude: 310,
        noiseScale: 15,
        subscriberStart: 2200,
        subscriberDivider: 330,
        subscriberDrift: 1,
        publishDays: [26, 38, 50, 64, 80],
        missingDays: new Set<number>([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 70]),
        spikes: { 72: 3.1, 84: 0.5 },
        keywords: ['nisza', 'analiza', 'planowanie'],
      },
    ];

    const insertDocumentStmt = connection.db.prepare<{
      documentId: string;
      channelId: string;
      videoId: string;
      title: string;
      description: string;
      transcript: string;
      publishedAt: string;
      updatedAt: string;
    }>(
      `
        INSERT INTO dim_content_documents (
          document_id,
          channel_id,
          video_id,
          title,
          description,
          transcript,
          published_at,
          source_import_id,
          updated_at
        )
        VALUES (
          @documentId,
          @channelId,
          @videoId,
          @title,
          @description,
          @transcript,
          @publishedAt,
          NULL,
          @updatedAt
        )
      `,
    );

    for (const config of channelConfigs) {
      const generated = createChannelSeries(config);

      const channelResult = repository.upsertChannel(generated.channel);
      if (!channelResult.ok) {
        throw new Error(channelResult.error.message);
      }

      const videosResult = repository.upsertVideos(generated.videos);
      if (!videosResult.ok) {
        throw new Error(videosResult.error.message);
      }

      const channelDaysResult = repository.upsertChannelDays(generated.channelDays);
      if (!channelDaysResult.ok) {
        throw new Error(channelDaysResult.error.message);
      }

      const videoDaysResult = repository.upsertVideoDays(generated.videoDays);
      if (!videoDaysResult.ok) {
        throw new Error(videoDaysResult.error.message);
      }

      for (const video of generated.videos) {
        insertDocumentStmt.run({
          documentId: `${video.videoId}-DOC`,
          channelId: config.channelId,
          videoId: video.videoId,
          title: video.title,
          description: video.description,
          transcript: `Transkrypt: ${video.title}. Tematy: ${config.keywords.join(', ')}.`,
          publishedAt: video.publishedAt,
          updatedAt: FIXED_NOW_ISO,
        });
      }

      const pipelineResult = runDataPipeline({
        db: connection.db,
        channelId: config.channelId,
        sourceSyncRunId: null,
        maxFreshnessDays: 3650,
      });
      if (!pipelineResult.ok) {
        throw new Error(pipelineResult.error.message);
      }

      const baselineViewsResult = runMlBaseline({
        db: connection.db,
        channelId: config.channelId,
        targetMetric: 'views',
        horizonDays: 14,
        now: FIXED_NOW,
      });
      if (!baselineViewsResult.ok) {
        throw new Error(baselineViewsResult.error.message);
      }

      const baselineSubscribersResult = runMlBaseline({
        db: connection.db,
        channelId: config.channelId,
        targetMetric: 'subscribers',
        horizonDays: 14,
        now: FIXED_NOW,
      });
      if (!baselineSubscribersResult.ok) {
        throw new Error(baselineSubscribersResult.error.message);
      }

      const anomalyViewsResult = runAnomalyTrendAnalysis({
        db: connection.db,
        channelId: config.channelId,
        targetMetric: 'views',
        dateFrom: isoDateFromOffset(0),
        dateTo: isoDateFromOffset(DAY_COUNT - 1),
        now: FIXED_NOW,
      });
      if (!anomalyViewsResult.ok) {
        throw new Error(anomalyViewsResult.error.message);
      }

      const anomalySubscribersResult = runAnomalyTrendAnalysis({
        db: connection.db,
        channelId: config.channelId,
        targetMetric: 'subscribers',
        dateFrom: isoDateFromOffset(0),
        dateTo: isoDateFromOffset(DAY_COUNT - 1),
        now: FIXED_NOW,
      });
      if (!anomalySubscribersResult.ok) {
        throw new Error(anomalySubscribersResult.error.message);
      }
    }

    connection.db.pragma('optimize');
    connection.db.exec('VACUUM;');

    const summary = connection.db
      .prepare<
        [],
        {
          channels: number;
          videos: number;
          days: number;
          anomalies: number;
          predictions: number;
          documents: number;
        }
      >(
        `
          SELECT
            (SELECT COUNT(*) FROM dim_channel) AS channels,
            (SELECT COUNT(*) FROM dim_video) AS videos,
            (SELECT COUNT(*) FROM fact_channel_day) AS days,
            (SELECT COUNT(*) FROM ml_anomalies) AS anomalies,
            (SELECT COUNT(*) FROM ml_predictions) AS predictions,
            (SELECT COUNT(*) FROM dim_content_documents) AS documents
        `,
      )
      .get();

    console.log('Wygenerowano fixtures/insight_golden.db');
    console.log(summary);
  } finally {
    const closeResult = connection.close();
    if (!closeResult.ok) {
      closeError = new Error(closeResult.error.message);
    }
  }

  if (closeError) {
    throw closeError;
  }
}

main();
