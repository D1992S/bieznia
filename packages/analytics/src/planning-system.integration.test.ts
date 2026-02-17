import { fileURLToPath } from 'node:url';
import { createDatabaseConnection, loadSeedFixtureFromFile, runMigrations, seedDatabaseFromFixture } from '@moze/core';
import { describe, expect, it } from 'vitest';
import { syncCompetitorSnapshots } from './competitor-intelligence.ts';
import { generatePlanningPlan, getPlanningPlan } from './planning-system.ts';

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

describe('Planning system integration', () => {
  it('generates deterministic recommendations with evidence and persists plan', () => {
    const seeded = createSeededDb();

    const syncResult = syncCompetitorSnapshots({
      db: seeded.connection.db,
      channelId: seeded.channelId,
      dateFrom: seeded.dateFrom,
      dateTo: seeded.dateTo,
      competitorCount: 3,
      now: () => new Date('2026-02-17T18:00:00.000Z'),
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

    const generateResult = generatePlanningPlan({
      db: seeded.connection.db,
      channelId: seeded.channelId,
      dateFrom: seeded.dateFrom,
      dateTo: seeded.dateTo,
      maxRecommendations: 6,
      clusterLimit: 12,
      gapLimit: 10,
      now: () => new Date('2026-02-17T18:02:00.000Z'),
    });
    expect(generateResult.ok).toBe(true);
    if (!generateResult.ok) {
      const closeResult = seeded.connection.close();
      expect(closeResult.ok).toBe(true);
      return;
    }

    expect(generateResult.value.totalRecommendations).toBeGreaterThan(0);
    expect(generateResult.value.items.length).toBe(generateResult.value.totalRecommendations);

    for (let index = 0; index < generateResult.value.items.length; index += 1) {
      const item = generateResult.value.items[index];
      if (!item) {
        continue;
      }

      expect(item.slotOrder).toBe(index + 1);
      expect(item.slotDate >= seeded.dateFrom && item.slotDate <= seeded.dateTo).toBe(true);
      expect(item.evidence.length).toBeGreaterThan(0);
      expect(item.priorityScore).toBeGreaterThanOrEqual(0);
      expect(item.priorityScore).toBeLessThanOrEqual(100);
    }

    const persistedPlanCount = seeded.connection.db
      .prepare<{ channelId: string; dateFrom: string; dateTo: string }, { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM planning_plans
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
    expect(persistedPlanCount?.total).toBe(1);

    const persistedRecommendationsCount = seeded.connection.db
      .prepare<{ planId: string }, { total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM planning_recommendations
          WHERE plan_id = @planId
        `,
      )
      .get({
        planId: generateResult.value.planId,
      });
    expect(persistedRecommendationsCount?.total).toBe(generateResult.value.totalRecommendations);

    const getResult = getPlanningPlan({
      db: seeded.connection.db,
      channelId: seeded.channelId,
      dateFrom: seeded.dateFrom,
      dateTo: seeded.dateTo,
      now: () => new Date('2026-02-17T18:03:00.000Z'),
    });
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value.planId).toBe(generateResult.value.planId);
      expect(getResult.value.items.length).toBe(generateResult.value.items.length);
    }

    const closeResult = seeded.connection.close();
    expect(closeResult.ok).toBe(true);
  });

  it('returns empty plan read model when no plan has been generated yet', () => {
    const seeded = createSeededDb();

    const getResult = getPlanningPlan({
      db: seeded.connection.db,
      channelId: seeded.channelId,
      dateFrom: seeded.dateFrom,
      dateTo: seeded.dateTo,
      now: () => new Date('2026-02-17T18:10:00.000Z'),
    });
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value.totalRecommendations).toBe(0);
      expect(getResult.value.items).toHaveLength(0);
    }

    const closeResult = seeded.connection.close();
    expect(closeResult.ok).toBe(true);
  });
});
