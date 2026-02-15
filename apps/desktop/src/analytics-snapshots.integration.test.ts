import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createChannelQueries,
  createDatabaseConnection,
  createImportSearchQueries,
  createMetricsQueries,
  createSemanticMetricService,
} from '@moze/core';
import { getLatestMlForecast, getMlAnomalies, getMlTrend } from '@moze/ml';
import { generateDashboardReport } from '@moze/reports';

const goldenDbPath = fileURLToPath(new URL('../../../fixtures/insight_golden.db', import.meta.url));
const FIXED_REPORT_NOW = () => new Date('2026-01-16T09:30:00.000Z');

function summarizeTimeseries(result: ReturnType<ReturnType<typeof createMetricsQueries>['getTimeseries']>) {
  if (!result.ok) {
    return result;
  }

  const points = result.value.points;
  return {
    metric: result.value.metric,
    granularity: result.value.granularity,
    totalPoints: points.length,
    firstPoints: points.slice(0, 4),
    lastPoints: points.slice(-4),
    sum: points.reduce((total, point) => total + point.value, 0),
  };
}

describe('analytics snapshots (golden db)', () => {
  it('matches stable snapshots for contract-level analytics queries', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moze-golden-snap-'));
    const tempDbPath = path.join(tempDir, 'insight_golden.db');
    fs.copyFileSync(goldenDbPath, tempDbPath);

    const connectionResult = createDatabaseConnection({
      filename: tempDbPath,
    });
    expect(connectionResult.ok).toBe(true);
    if (!connectionResult.ok) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      return;
    }

    try {
      const db = connectionResult.value.db;
      const metricsQueries = createMetricsQueries(db);
      const channelQueries = createChannelQueries(db);
      const importSearchQueries = createImportSearchQueries(db);
      const semanticMetrics = createSemanticMetricService(db);

      const fullFrom = '2025-08-01';
      const fullTo = '2025-10-29';
      const last30From = '2025-09-30';
      const last30To = '2025-10-29';
      const last14From = '2025-10-16';
      const last14To = '2025-10-29';

      const snapshots = [
        {
          query: 'kpi.channel1.last30',
          result: metricsQueries.getKpis({
            channelId: 'UC-GOLD-PL-001',
            dateFrom: last30From,
            dateTo: last30To,
          }),
        },
        {
          query: 'kpi.channel2.last30',
          result: metricsQueries.getKpis({
            channelId: 'UC-GOLD-PL-002',
            dateFrom: last30From,
            dateTo: last30To,
          }),
        },
        {
          query: 'kpi.channel3.last30',
          result: metricsQueries.getKpis({
            channelId: 'UC-GOLD-PL-003',
            dateFrom: last30From,
            dateTo: last30To,
          }),
        },
        {
          query: 'timeseries.views.channel1.last14.day',
          result: summarizeTimeseries(
            metricsQueries.getTimeseries({
              channelId: 'UC-GOLD-PL-001',
              metric: 'views',
              dateFrom: last14From,
              dateTo: last14To,
              granularity: 'day',
            }),
          ),
        },
        {
          query: 'timeseries.views.channel1.full.week',
          result: summarizeTimeseries(
            metricsQueries.getTimeseries({
              channelId: 'UC-GOLD-PL-001',
              metric: 'views',
              dateFrom: fullFrom,
              dateTo: fullTo,
              granularity: 'week',
            }),
          ),
        },
        {
          query: 'timeseries.subscribers.channel1.last30.day',
          result: summarizeTimeseries(
            metricsQueries.getTimeseries({
              channelId: 'UC-GOLD-PL-001',
              metric: 'subscribers',
              dateFrom: last30From,
              dateTo: last30To,
              granularity: 'day',
            }),
          ),
        },
        {
          query: 'timeseries.likes.channel2.full.week',
          result: summarizeTimeseries(
            metricsQueries.getTimeseries({
              channelId: 'UC-GOLD-PL-002',
              metric: 'likes',
              dateFrom: fullFrom,
              dateTo: fullTo,
              granularity: 'week',
            }),
          ),
        },
        {
          query: 'timeseries.comments.channel2.full.month',
          result: summarizeTimeseries(
            metricsQueries.getTimeseries({
              channelId: 'UC-GOLD-PL-002',
              metric: 'comments',
              dateFrom: fullFrom,
              dateTo: fullTo,
              granularity: 'month',
            }),
          ),
        },
        {
          query: 'channel.info.1',
          result: channelQueries.getChannelInfo({ channelId: 'UC-GOLD-PL-001' }),
        },
        {
          query: 'channel.info.2',
          result: channelQueries.getChannelInfo({ channelId: 'UC-GOLD-PL-002' }),
        },
        {
          query: 'channel.info.3',
          result: channelQueries.getChannelInfo({ channelId: 'UC-GOLD-PL-003' }),
        },
        {
          query: 'report.generate.channel1.last30.views',
          result: generateDashboardReport({
            db,
            channelId: 'UC-GOLD-PL-001',
            dateFrom: last30From,
            dateTo: last30To,
            targetMetric: 'views',
            now: FIXED_REPORT_NOW,
          }),
        },
        {
          query: 'report.generate.channel2.last30.subscribers',
          result: generateDashboardReport({
            db,
            channelId: 'UC-GOLD-PL-002',
            dateFrom: last30From,
            dateTo: last30To,
            targetMetric: 'subscribers',
            now: FIXED_REPORT_NOW,
          }),
        },
        {
          query: 'ml.forecast.channel1.views',
          result: getLatestMlForecast({
            db,
            channelId: 'UC-GOLD-PL-001',
            targetMetric: 'views',
          }),
        },
        {
          query: 'ml.forecast.channel2.subscribers',
          result: getLatestMlForecast({
            db,
            channelId: 'UC-GOLD-PL-002',
            targetMetric: 'subscribers',
          }),
        },
        {
          query: 'ml.anomalies.channel1.views.full',
          result: getMlAnomalies({
            db,
            channelId: 'UC-GOLD-PL-001',
            targetMetric: 'views',
            dateFrom: fullFrom,
            dateTo: fullTo,
          }),
        },
        {
          query: 'ml.anomalies.channel2.views.full.high_critical',
          result: getMlAnomalies({
            db,
            channelId: 'UC-GOLD-PL-002',
            targetMetric: 'views',
            dateFrom: fullFrom,
            dateTo: fullTo,
            severities: ['high', 'critical'],
          }),
        },
        {
          query: 'ml.trend.channel1.views.full',
          result: getMlTrend({
            db,
            channelId: 'UC-GOLD-PL-001',
            targetMetric: 'views',
            dateFrom: fullFrom,
            dateTo: fullTo,
            seasonalityPeriodDays: 7,
          }),
        },
        {
          query: 'ml.trend.channel3.subscribers.full',
          result: getMlTrend({
            db,
            channelId: 'UC-GOLD-PL-003',
            targetMetric: 'subscribers',
            dateFrom: fullFrom,
            dateTo: fullTo,
            seasonalityPeriodDays: 7,
          }),
        },
        {
          query: 'search.content.channel1.analityka',
          result: importSearchQueries.searchContent({
            channelId: 'UC-GOLD-PL-001',
            query: 'analityka',
            limit: 5,
            offset: 0,
          }),
        },
        {
          query: 'search.content.channel2.shorts',
          result: importSearchQueries.searchContent({
            channelId: 'UC-GOLD-PL-002',
            query: 'shorts',
            limit: 5,
            offset: 0,
          }),
        },
        {
          query: 'semantic.bundle.channel1.last30',
          result: semanticMetrics.readMetricValues({
            metricIds: [
              'channel.views.total',
              'channel.avg_views_per_video',
              'channel.engagement_rate',
              'ml.anomalies.count',
              'ml.forecast.points_count',
              'video.views.max',
            ],
            channelId: 'UC-GOLD-PL-001',
            dateFrom: last30From,
            dateTo: last30To,
          }),
        },
        {
          query: 'semantic.bundle.channel3.full',
          result: semanticMetrics.readMetricValues({
            metricIds: [
              'channel.views.total',
              'channel.subscribers.latest',
              'channel.videos.latest',
              'content.documents.count',
              'ml.models.active_count',
            ],
            channelId: 'UC-GOLD-PL-003',
            dateFrom: fullFrom,
            dateTo: fullTo,
          }),
        },
      ];

      expect(snapshots).toMatchSnapshot();
    } finally {
      const closeResult = connectionResult.value.close();
      expect(closeResult.ok).toBe(true);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
