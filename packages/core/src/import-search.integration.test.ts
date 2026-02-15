import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDatabaseConnection } from './database.ts';
import { loadSeedFixtureFromFile, seedDatabaseFromFixture } from './fixtures/index.ts';
import { runMigrations } from './migrations/index.ts';
import { createImportSearchQueries } from './queries/import-search-queries.ts';
import { createMetricsQueries } from './queries/metrics-queries.ts';

const fixturePath = fileURLToPath(new URL('../../../fixtures/seed-data.json', import.meta.url));

describe('Import + search integration', () => {
  it('previews CSV, imports rows and exposes data through search + metrics', () => {
    const connectionResult = createDatabaseConnection();
    expect(connectionResult.ok).toBe(true);
    if (!connectionResult.ok) {
      return;
    }

    const migrationResult = runMigrations(connectionResult.value.db);
    expect(migrationResult.ok).toBe(true);
    if (!migrationResult.ok) {
      return;
    }

    const fixtureResult = loadSeedFixtureFromFile(fixturePath);
    expect(fixtureResult.ok).toBe(true);
    if (!fixtureResult.ok) {
      return;
    }

    const seedResult = seedDatabaseFromFixture(connectionResult.value.db, fixtureResult.value);
    expect(seedResult.ok).toBe(true);
    if (!seedResult.ok) {
      return;
    }

    const importSearchQueries = createImportSearchQueries(connectionResult.value.db);
    const metricsQueries = createMetricsQueries(connectionResult.value.db);
    const channelId = fixtureResult.value.channel.channelId;

    const csvText = [
      'data;wyswietlenia;subskrypcje;filmy;tytul;opis;transkrypcja;idvideo',
      '2026-02-01;1500;12000;180;Nowy odcinek;Opis strategii;To jest tutorial analytics;VID-CSV-001',
      '2026-02-02;1650;12040;181;Kolejny odcinek;Opis wdrozenia;Tutorial z checklista;VID-CSV-002',
    ].join('\n');

    const previewResult = importSearchQueries.previewCsvImport({
      channelId,
      sourceName: 'integration-test',
      csvText,
      delimiter: 'auto',
      hasHeader: true,
      previewRowsLimit: 5,
    });
    expect(previewResult.ok).toBe(true);
    if (previewResult.ok) {
      expect(previewResult.value.detectedDelimiter).toBe('semicolon');
      expect(previewResult.value.suggestedMapping.date).toBe('data');
    }

    const importResult = importSearchQueries.runCsvImport({
      channelId,
      sourceName: 'integration-test',
      csvText,
      delimiter: 'auto',
      hasHeader: true,
      mapping: {
        date: 'data',
        views: 'wyswietlenia',
        subscribers: 'subskrypcje',
        videos: 'filmy',
        title: 'tytul',
        description: 'opis',
        transcript: 'transkrypcja',
        videoId: 'idvideo',
      },
    });
    expect(importResult.ok).toBe(true);
    if (!importResult.ok) {
      return;
    }

    expect(importResult.value.rowsValid).toBe(2);
    expect(importResult.value.rowsInvalid).toBe(0);
    expect(importResult.value.importedDateFrom).toBe('2026-02-01');
    expect(importResult.value.importedDateTo).toBe('2026-02-02');

    const kpiResult = metricsQueries.getKpis({
      channelId,
      dateFrom: '2026-02-01',
      dateTo: '2026-02-02',
    });
    expect(kpiResult.ok).toBe(true);
    if (kpiResult.ok) {
      expect(kpiResult.value.views).toBe(3150);
      expect(kpiResult.value.subscribers).toBe(12040);
    }

    const searchResult = importSearchQueries.searchContent({
      channelId,
      query: 'tutorial',
      limit: 10,
      offset: 0,
    });
    expect(searchResult.ok).toBe(true);
    if (searchResult.ok) {
      expect(searchResult.value.total).toBeGreaterThan(0);
      expect(searchResult.value.items[0]?.snippet.toLowerCase()).toContain('tutorial');
    }

    const closeResult = connectionResult.value.close();
    expect(closeResult.ok).toBe(true);
  });

  it('returns row/column validation info for invalid CSV', () => {
    const connectionResult = createDatabaseConnection();
    expect(connectionResult.ok).toBe(true);
    if (!connectionResult.ok) {
      return;
    }

    const migrationResult = runMigrations(connectionResult.value.db);
    expect(migrationResult.ok).toBe(true);
    if (!migrationResult.ok) {
      return;
    }

    const fixtureResult = loadSeedFixtureFromFile(fixturePath);
    expect(fixtureResult.ok).toBe(true);
    if (!fixtureResult.ok) {
      return;
    }

    const seedResult = seedDatabaseFromFixture(connectionResult.value.db, fixtureResult.value);
    expect(seedResult.ok).toBe(true);
    if (!seedResult.ok) {
      return;
    }

    const importSearchQueries = createImportSearchQueries(connectionResult.value.db);
    const invalidImportResult = importSearchQueries.runCsvImport({
      channelId: fixtureResult.value.channel.channelId,
      sourceName: 'integration-test',
      csvText: 'date,views,subscribers,videos\n2026-02-10,abc,12000,180',
      delimiter: 'auto',
      hasHeader: true,
      mapping: {
        date: 'date',
        views: 'views',
        subscribers: 'subscribers',
        videos: 'videos',
      },
    });

    expect(invalidImportResult.ok).toBe(false);
    if (!invalidImportResult.ok) {
      expect(invalidImportResult.error.code).toBe('CSV_IMPORT_NO_VALID_ROWS');
      const issues = invalidImportResult.error.context.validationIssues as Array<{ rowNumber: number; column: string }> | undefined;
      expect(Array.isArray(issues)).toBe(true);
      expect(issues?.[0]?.rowNumber).toBe(2);
      expect(issues?.[0]?.column).toBe('views');
    }

    const closeResult = connectionResult.value.close();
    expect(closeResult.ok).toBe(true);
  });
});

