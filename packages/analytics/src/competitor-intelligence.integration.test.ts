import { fileURLToPath } from 'node:url';
import { createDatabaseConnection, loadSeedFixtureFromFile, runMigrations, seedDatabaseFromFixture } from '@moze/core';
import { describe, expect, it } from 'vitest';
import { getCompetitorInsights, syncCompetitorSnapshots } from './competitor-intelligence.ts';

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

  const allDates = fixtureResult.value.channelDaily.map((row) => row.date).sort((a, b) => a.localeCompare(b));
  const dateFrom = allDates[0];
  const dateTo = allDates[allDates.length - 1];
  if (!dateFrom || !dateTo) {
    throw new Error('No data in fixture channelDaily.');
  }

  return {
    connection: connectionResult.value,
    channelId: fixtureResult.value.channel.channelId,
    dateFrom,
    dateTo,
  };
}

describe('Competitor intelligence integration', () => {
  it('syncs competitor snapshots with delta detection and returns stable second run', () => {
    const seeded = createSeededDb();

    const firstSync = syncCompetitorSnapshots({
      db: seeded.connection.db,
      channelId: seeded.channelId,
      dateFrom: seeded.dateFrom,
      dateTo: seeded.dateTo,
      competitorCount: 3,
      now: () => new Date('2026-02-17T13:00:00.000Z'),
    });

    expect(firstSync.ok).toBe(true);
    if (!firstSync.ok) {
      const closeResult = seeded.connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    expect(firstSync.value.competitorsSynced).toBe(3);
    expect(firstSync.value.snapshotsProcessed).toBeGreaterThan(0);
    expect(firstSync.value.inserted).toBeGreaterThan(0);

    const persistedCount = seeded.connection.db
      .prepare<
        { channelId: string; dateFrom: string; dateTo: string },
        { total: number }
      >(
        `
          SELECT COUNT(*) AS total
          FROM fact_competitor_day
          WHERE channel_id = @channelId
            AND date BETWEEN @dateFrom AND @dateTo
        `,
      )
      .get({
        channelId: seeded.channelId,
        dateFrom: seeded.dateFrom,
        dateTo: seeded.dateTo,
      });
    expect(persistedCount?.total ?? 0).toBe(firstSync.value.snapshotsProcessed);

    const secondSync = syncCompetitorSnapshots({
      db: seeded.connection.db,
      channelId: seeded.channelId,
      dateFrom: seeded.dateFrom,
      dateTo: seeded.dateTo,
      competitorCount: 3,
      now: () => new Date('2026-02-17T13:01:00.000Z'),
    });

    expect(secondSync.ok).toBe(true);
    if (secondSync.ok) {
      expect(secondSync.value.inserted).toBe(0);
      expect(secondSync.value.updated).toBe(0);
      expect(secondSync.value.unchanged).toBe(secondSync.value.snapshotsProcessed);
    }

    const closeResult = seeded.connection.close();
    expect(closeResult.ok).toBe(true);
  });

  it('returns momentum ranking and detects planted hit outliers', () => {
    const seeded = createSeededDb();

    const syncResult = syncCompetitorSnapshots({
      db: seeded.connection.db,
      channelId: seeded.channelId,
      dateFrom: seeded.dateFrom,
      dateTo: seeded.dateTo,
      competitorCount: 3,
      now: () => new Date('2026-02-17T13:10:00.000Z'),
    });
    expect(syncResult.ok).toBe(true);
    if (!syncResult.ok) {
      const closeResult = seeded.connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    const competitorIdRow = seeded.connection.db
      .prepare<{ channelId: string }, { competitorChannelId: string }>(
        `
          SELECT competitor_channel_id AS competitorChannelId
          FROM dim_competitor
          WHERE channel_id = @channelId
          ORDER BY competitor_channel_id ASC
          LIMIT 1
        `,
      )
      .get({ channelId: seeded.channelId });
    expect(competitorIdRow?.competitorChannelId).toBeDefined();
    if (!competitorIdRow) {
      const closeResult = seeded.connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    seeded.connection.db
      .prepare<{ channelId: string; competitorChannelId: string; date: string }>(
        `
          UPDATE fact_competitor_day
          SET views = views * 9
          WHERE channel_id = @channelId
            AND competitor_channel_id = @competitorChannelId
            AND date = @date
        `,
      )
      .run({
        channelId: seeded.channelId,
        competitorChannelId: competitorIdRow.competitorChannelId,
        date: seeded.dateTo,
      });

    const insightsResult = getCompetitorInsights({
      db: seeded.connection.db,
      channelId: seeded.channelId,
      dateFrom: seeded.dateFrom,
      dateTo: seeded.dateTo,
      limit: 5,
      now: () => new Date('2026-02-17T13:15:00.000Z'),
    });
    expect(insightsResult.ok).toBe(true);
    if (insightsResult.ok) {
      expect(insightsResult.value.totalCompetitors).toBeGreaterThanOrEqual(3);
      expect(insightsResult.value.items.length).toBeGreaterThanOrEqual(3);
      for (let index = 1; index < insightsResult.value.items.length; index += 1) {
        const previous = insightsResult.value.items[index - 1];
        const current = insightsResult.value.items[index];
        if (!previous || !current) {
          continue;
        }
        expect(previous.momentumScore >= current.momentumScore).toBe(true);
      }

      const plantedHit = insightsResult.value.hits.find((hit) =>
        hit.competitorChannelId === competitorIdRow.competitorChannelId
        && hit.date === seeded.dateTo);
      expect(plantedHit).toBeDefined();
      if (plantedHit) {
        expect(plantedHit.zScore).toBeGreaterThan(3);
      }
    }

    const closeResult = seeded.connection.close();
    expect(closeResult.ok).toBe(true);
  });
});
