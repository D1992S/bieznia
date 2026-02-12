import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDatabaseConnection,
  loadSeedFixtureFromFile,
  runMigrations,
  seedDatabaseFromFixture,
  type DatabaseConnection,
} from '@moze/core';
import { describe, expect, it } from 'vitest';
import { exportDashboardReport, generateDashboardReport, renderDashboardReportHtml } from './report-service.ts';

const fixturePath = fileURLToPath(new URL('../../../fixtures/seed-data.json', import.meta.url));

interface TestContext {
  close: () => void;
  db: DatabaseConnection['db'];
  channelId: string;
  dateFrom: string;
  dateTo: string;
}

function createTestContext(): TestContext {
  const connectionResult = createDatabaseConnection();
  expect(connectionResult.ok).toBe(true);
  if (!connectionResult.ok) {
    throw new Error(connectionResult.error.message);
  }

  const migrationResult = runMigrations(connectionResult.value.db);
  expect(migrationResult.ok).toBe(true);
  if (!migrationResult.ok) {
    throw new Error(migrationResult.error.message);
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

  const channelDaily = fixtureResult.value.channelDaily;
  const firstPoint = channelDaily[channelDaily.length - 30] ?? channelDaily[0];
  const lastPoint = channelDaily[channelDaily.length - 1];
  if (!firstPoint || !lastPoint) {
    throw new Error('Fixture nie zawiera wystarczającej liczby punktów.');
  }

  return {
    close: () => {
      const closeResult = connectionResult.value.close();
      expect(closeResult.ok).toBe(true);
    },
    db: connectionResult.value.db,
    channelId: fixtureResult.value.channel.channelId,
    dateFrom: firstPoint.date,
    dateTo: lastPoint.date,
  };
}

function seedActiveForecast(db: TestContext['db'], channelId: string): void {
  const trainedAt = '2026-02-12T22:00:00.000Z';
  const modelInsert = db.prepare<{
    channelId: string;
    trainedAt: string;
  }>(
    `
      INSERT INTO ml_models (
        channel_id,
        target_metric,
        model_type,
        version,
        status,
        is_active,
        config_json,
        metrics_json,
        source_sync_run_id,
        trained_at
      )
      VALUES (
        @channelId,
        'views',
        'holt-winters',
        'v1',
        'active',
        1,
        '{"strategy":"double-exponential"}',
        '{"mae":10}',
        NULL,
        @trainedAt
      )
    `,
  );

  const modelResult = modelInsert.run({ channelId, trainedAt });
  const modelId = typeof modelResult.lastInsertRowid === 'bigint'
    ? Number(modelResult.lastInsertRowid)
    : modelResult.lastInsertRowid;

  const predictionInsert = db.prepare<{
    modelId: number;
    channelId: string;
    predictionDate: string;
    horizonDays: number;
    predictedValue: number;
    p10: number;
    p50: number;
    p90: number;
    generatedAt: string;
  }>(
    `
      INSERT INTO ml_predictions (
        model_id,
        channel_id,
        target_metric,
        prediction_date,
        horizon_days,
        predicted_value,
        actual_value,
        p10,
        p50,
        p90,
        generated_at
      )
      VALUES (
        @modelId,
        @channelId,
        'views',
        @predictionDate,
        @horizonDays,
        @predictedValue,
        NULL,
        @p10,
        @p50,
        @p90,
        @generatedAt
      )
    `,
  );

  predictionInsert.run({
    modelId,
    channelId,
    predictionDate: '2026-02-13',
    horizonDays: 1,
    predictedValue: 1500,
    p10: 1300,
    p50: 1500,
    p90: 1700,
    generatedAt: trainedAt,
  });
  predictionInsert.run({
    modelId,
    channelId,
    predictionDate: '2026-02-14',
    horizonDays: 2,
    predictedValue: 1550,
    p10: 1320,
    p50: 1550,
    p90: 1780,
    generatedAt: trainedAt,
  });
}

describe('reports integration', () => {
  it('generates dashboard report with kpis, forecast and insights', () => {
    const ctx = createTestContext();
    seedActiveForecast(ctx.db, ctx.channelId);

    const reportResult = generateDashboardReport({
      db: ctx.db,
      channelId: ctx.channelId,
      dateFrom: ctx.dateFrom,
      dateTo: ctx.dateTo,
      targetMetric: 'views',
    });

    expect(reportResult.ok).toBe(true);
    if (reportResult.ok) {
      expect(reportResult.value.channel.channelId).toBe(ctx.channelId);
      expect(reportResult.value.kpis.views).toBeGreaterThan(0);
      expect(reportResult.value.timeseries.points.length).toBeGreaterThan(0);
      expect(reportResult.value.forecast.points.length).toBe(2);
      expect(reportResult.value.topVideos.length).toBeGreaterThan(0);
      expect(reportResult.value.insights.length).toBeGreaterThan(0);

      const html = renderDashboardReportHtml(reportResult.value);
      expect(html).toContain('Raport kanału');
      expect(html).toContain('Top filmy');
    }

    ctx.close();
  });

  it('returns validation error for invalid date range', () => {
    const ctx = createTestContext();

    const reportResult = generateDashboardReport({
      db: ctx.db,
      channelId: ctx.channelId,
      dateFrom: ctx.dateTo,
      dateTo: ctx.dateFrom,
      targetMetric: 'views',
    });

    expect(reportResult.ok).toBe(false);
    if (!reportResult.ok) {
      expect(reportResult.error.code).toBe('REPORT_INVALID_DATE_RANGE');
    }

    ctx.close();
  });

  it('exports report package to json/csv/html files', () => {
    const ctx = createTestContext();
    seedActiveForecast(ctx.db, ctx.channelId);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moze-reports-'));

    const exportResult = exportDashboardReport({
      db: ctx.db,
      channelId: ctx.channelId,
      dateFrom: ctx.dateFrom,
      dateTo: ctx.dateTo,
      targetMetric: 'views',
      exportDir: tempDir,
      formats: ['json', 'csv', 'html'],
    });

    expect(exportResult.ok).toBe(true);
    if (exportResult.ok) {
      expect(exportResult.value.files.length).toBe(6);
      for (const file of exportResult.value.files) {
        expect(fs.existsSync(file.path)).toBe(true);
      }

      const topVideosCsvPath = path.join(exportResult.value.exportDir, 'top_videos.csv');
      const topVideosCsv = fs.readFileSync(topVideosCsvPath, 'utf8');
      expect(topVideosCsv).toContain('video_id,title,published_at,view_count,like_count,comment_count');

      const htmlPath = path.join(exportResult.value.exportDir, 'report.html');
      const html = fs.readFileSync(htmlPath, 'utf8');
      expect(html).toContain('Raport kanału');
    }

    ctx.close();
  });
});
