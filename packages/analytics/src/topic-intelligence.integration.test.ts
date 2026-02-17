import { fileURLToPath } from 'node:url';
import { createDatabaseConnection, loadSeedFixtureFromFile, runMigrations, seedDatabaseFromFixture } from '@moze/core';
import { describe, expect, it } from 'vitest';
import { syncCompetitorSnapshots } from './competitor-intelligence.ts';
import { getTopicIntelligence, runTopicIntelligence } from './topic-intelligence.ts';

const fixturePath = fileURLToPath(new URL('../../../fixtures/seed-data.json', import.meta.url));

function createSeededDb() {
  const connectionResult = createDatabaseConnection();
  expect(connectionResult.ok).toBe(true);
  if (!connectionResult.ok) {
    throw new Error(connectionResult.error.message);
  }

  const migrationsResult = runMigrations(connectionResult.value.db);
  expect(migrationsResult.ok).toBe(true);
  if (!migrationsResult.ok) {
    throw new Error(migrationsResult.error.message);
  }

  const fixtureResult = loadSeedFixtureFromFile(fixturePath);
  expect(fixtureResult.ok).toBe(true);
  if (!fixtureResult.ok) {
    throw new Error(fixtureResult.error.message);
  }

  const seedResult = seedDatabaseFromFixture(connectionResult.value.db, fixtureResult.value);
  expect(seedResult.ok).toBe(true);
  if (!seedResult.ok) {
    throw new Error(seedResult.error.message);
  }

  const allDates = fixtureResult.value.videoDaily.map((row) => row.date).sort((a, b) => a.localeCompare(b));
  const dateFrom = allDates[0];
  const dateTo = allDates[allDates.length - 1];
  if (!dateFrom || !dateTo) {
    throw new Error('No data in fixture videoDaily.');
  }

  return {
    connection: connectionResult.value,
    channelId: fixtureResult.value.channel.channelId,
    dateFrom,
    dateTo,
  };
}

describe('Topic intelligence integration', () => {
  it('builds deterministic clusters and gaps and persists results', () => {
    const seeded = createSeededDb();

    const syncResult = syncCompetitorSnapshots({
      db: seeded.connection.db,
      channelId: seeded.channelId,
      dateFrom: seeded.dateFrom,
      dateTo: seeded.dateTo,
      competitorCount: 3,
      now: () => new Date('2026-02-18T08:00:00.000Z'),
    });
    expect(syncResult.ok).toBe(true);

    seeded.connection.db
      .prepare<{ channelId: string; dateFrom: string; dateTo: string }>(
        `
          UPDATE fact_competitor_day
          SET views = views * 4
          WHERE channel_id = @channelId
            AND date BETWEEN @dateFrom AND @dateTo
        `,
      )
      .run({
        channelId: seeded.channelId,
        dateFrom: seeded.dateFrom,
        dateTo: seeded.dateTo,
      });

    const runResult = runTopicIntelligence({
      db: seeded.connection.db,
      channelId: seeded.channelId,
      dateFrom: seeded.dateFrom,
      dateTo: seeded.dateTo,
      clusterLimit: 200,
      gapLimit: 200,
      now: () => new Date('2026-02-18T08:01:00.000Z'),
    });
    expect(runResult.ok).toBe(true);
    if (!runResult.ok) {
      const closeResult = seeded.connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    expect(runResult.value.totalClusters).toBeGreaterThan(0);
    expect(runResult.value.clusters.length).toBeGreaterThan(0);
    expect(runResult.value.gaps.length).toBeGreaterThan(0);

    for (let index = 1; index < runResult.value.clusters.length; index += 1) {
      const previous = runResult.value.clusters[index - 1];
      const current = runResult.value.clusters[index];
      if (!previous || !current) {
        continue;
      }
      expect(previous.ownerViewsTotal >= current.ownerViewsTotal).toBe(true);
    }

    for (let index = 1; index < runResult.value.gaps.length; index += 1) {
      const previous = runResult.value.gaps[index - 1];
      const current = runResult.value.gaps[index];
      if (!previous || !current) {
        continue;
      }
      expect(previous.gapScore >= current.gapScore).toBe(true);
    }

    const persistedClusterCount = seeded.connection.db
      .prepare<{ channelId: string }, { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM dim_topic_cluster
          WHERE channel_id = @channelId
        `,
      )
      .get({ channelId: seeded.channelId });
    expect((persistedClusterCount?.total ?? 0) >= runResult.value.totalClusters).toBe(true);

    const persistedGapCount = seeded.connection.db
      .prepare<{ channelId: string; dateFrom: string; dateTo: string }, { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM agg_topic_gaps
          WHERE channel_id = @channelId
            AND date_from = @dateFrom
            AND date_to = @dateTo
        `,
      )
      .get({
        channelId: seeded.channelId,
        dateFrom: seeded.dateFrom,
        dateTo: seeded.dateTo,
      });
    expect(persistedGapCount?.total).toBe(runResult.value.totalClusters);

    const persistedPressureCount = seeded.connection.db
      .prepare<{ channelId: string; dateFrom: string; dateTo: string }, { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM fact_topic_pressure_day
          WHERE channel_id = @channelId
            AND date BETWEEN @dateFrom AND @dateTo
        `,
      )
      .get({
        channelId: seeded.channelId,
        dateFrom: seeded.dateFrom,
        dateTo: seeded.dateTo,
      });
    expect((persistedPressureCount?.total ?? 0)).toBeGreaterThan(0);

    const getResult = getTopicIntelligence({
      db: seeded.connection.db,
      channelId: seeded.channelId,
      dateFrom: seeded.dateFrom,
      dateTo: seeded.dateTo,
      clusterLimit: 200,
      gapLimit: 200,
      now: () => new Date('2026-02-18T08:02:00.000Z'),
    });
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value.totalClusters).toBe(runResult.value.totalClusters);
      expect(getResult.value.clusters.length).toBe(runResult.value.clusters.length);
    }

    const closeResult = seeded.connection.close();
    expect(closeResult.ok).toBe(true);
  });

  it('detects planted overlap cluster with elevated cannibalization risk', () => {
    const seeded = createSeededDb();

    const videoIds = seeded.connection.db
      .prepare<{ channelId: string; dateFrom: string; dateTo: string }, { videoId: string }>(
        `
          SELECT DISTINCT video_id AS videoId
          FROM fact_video_day
          WHERE channel_id = @channelId
            AND date BETWEEN @dateFrom AND @dateTo
          ORDER BY video_id ASC
          LIMIT 4
        `,
      )
      .all({
        channelId: seeded.channelId,
        dateFrom: seeded.dateFrom,
        dateTo: seeded.dateTo,
      })
      .map((row) => row.videoId);
    expect(videoIds.length).toBe(4);
    if (videoIds.length < 4) {
      const closeResult = seeded.connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    const updateVideoStmt = seeded.connection.db.prepare<{ videoId: string; orderNo: number }>(
      `
        UPDATE dim_video
        SET
          title = 'Overlaptopic odcinek ' || @orderNo,
          description = 'Overlaptopic analiza overlaptopic'
        WHERE video_id = @videoId
      `,
    );
    videoIds.forEach((videoId, index) => {
      updateVideoStmt.run({ videoId, orderNo: index + 1 });
    });

    const syncResult = syncCompetitorSnapshots({
      db: seeded.connection.db,
      channelId: seeded.channelId,
      dateFrom: seeded.dateFrom,
      dateTo: seeded.dateTo,
      competitorCount: 3,
      now: () => new Date('2026-02-18T09:00:00.000Z'),
    });
    expect(syncResult.ok).toBe(true);

    seeded.connection.db
      .prepare<{ channelId: string; dateFrom: string; dateTo: string }>(
        `
          UPDATE fact_competitor_day
          SET views = views * 4
          WHERE channel_id = @channelId
            AND date BETWEEN @dateFrom AND @dateTo
        `,
      )
      .run({
        channelId: seeded.channelId,
        dateFrom: seeded.dateFrom,
        dateTo: seeded.dateTo,
      });

    const runResult = runTopicIntelligence({
      db: seeded.connection.db,
      channelId: seeded.channelId,
      dateFrom: seeded.dateFrom,
      dateTo: seeded.dateTo,
      clusterLimit: 200,
      gapLimit: 200,
      now: () => new Date('2026-02-18T09:01:00.000Z'),
    });
    expect(runResult.ok).toBe(true);
    if (!runResult.ok) {
      const closeResult = seeded.connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    const overlapCluster = runResult.value.clusters.find((cluster) =>
      cluster.clusterId === 'topic-overlaptopic'
      || cluster.keywords.some((keyword) => keyword === 'overlaptopic'));
    expect(overlapCluster).toBeDefined();
    if (overlapCluster) {
      expect(overlapCluster.videos).toBeGreaterThanOrEqual(4);
    }

    const overlapClusterId = overlapCluster?.clusterId ?? 'topic-overlaptopic';
    const persistedCannibalizationRow = seeded.connection.db
      .prepare<{ channelId: string; clusterId: string; dateFrom: string; dateTo: string }, { risk: number }>(
        `
          SELECT cannibalization_risk AS risk
          FROM agg_topic_gaps
          WHERE channel_id = @channelId
            AND cluster_id = @clusterId
            AND date_from = @dateFrom
            AND date_to = @dateTo
        `,
      )
      .get({
        channelId: seeded.channelId,
        clusterId: overlapClusterId,
        dateFrom: seeded.dateFrom,
        dateTo: seeded.dateTo,
      });
    expect((persistedCannibalizationRow?.risk ?? 0)).toBeGreaterThan(0.5);

    const closeResult = seeded.connection.close();
    expect(closeResult.ok).toBe(true);
  });
});
