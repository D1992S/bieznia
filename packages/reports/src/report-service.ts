import fs from 'node:fs';
import path from 'node:path';
import { createChannelQueries, createMetricsQueries, type DatabaseConnection } from '@moze/core';
import {
  AppError,
  MlForecastPointDTOSchema,
  MlModelTypeSchema,
  ReportExportInputDTOSchema,
  ReportExportResultDTOSchema,
  ReportGenerateInputDTOSchema,
  ReportGenerateResultDTOSchema,
  ReportTopVideoDTOSchema,
  err,
  ok,
  type MlForecastResultDTO,
  type MlTargetMetric,
  type ReportExportResultDTO,
  type ReportGenerateResultDTO,
  type ReportInsightDTO,
  type ReportTopVideoDTO,
  type Result,
} from '@moze/shared';

interface ActiveForecastModelRow {
  modelId: number;
  modelType: string;
  trainedAt: string;
}

interface ForecastPredictionRow {
  predictionDate: string;
  horizonDays: number;
  predictedValue: number;
  p10: number;
  p50: number;
  p90: number;
}

interface TopVideoRow {
  videoId: string;
  title: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

interface DateRangeSummary {
  dateFrom: string;
  dateTo: string;
  days: number;
}

export interface GenerateDashboardReportInput {
  db: DatabaseConnection['db'];
  channelId: string;
  dateFrom: string;
  dateTo: string;
  targetMetric?: MlTargetMetric;
}

export interface ExportDashboardReportInput {
  db: DatabaseConnection['db'];
  channelId: string;
  dateFrom: string;
  dateTo: string;
  targetMetric?: MlTargetMetric;
  exportDir?: string | null;
  formats?: Array<'json' | 'csv' | 'html'>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function parseIsoDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function buildDateRangeSummary(dateFrom: string, dateTo: string): Result<DateRangeSummary, AppError> {
  const from = parseIsoDate(dateFrom).getTime();
  const to = parseIsoDate(dateTo).getTime();

  if (Number.isNaN(from) || Number.isNaN(to)) {
    return err(
      AppError.create(
        'REPORT_INVALID_DATE',
        'Zakres dat raportu jest niepoprawny.',
        'error',
        { dateFrom, dateTo },
      ),
    );
  }

  if (from > to) {
    return err(
      AppError.create(
        'REPORT_INVALID_DATE_RANGE',
        'Data poczatkowa raportu nie moze byc pozniejsza niz koncowa.',
        'error',
        { dateFrom, dateTo },
      ),
    );
  }

  const days = Math.floor((to - from) / 86_400_000) + 1;
  return ok({ dateFrom, dateTo, days });
}

function readActiveForecast(
  db: DatabaseConnection['db'],
  channelId: string,
  targetMetric: MlTargetMetric,
): Result<MlForecastResultDTO, AppError> {
  const modelStmt = db.prepare<{ channelId: string; targetMetric: MlTargetMetric }, ActiveForecastModelRow>(
    `
      SELECT
        id AS modelId,
        model_type AS modelType,
        trained_at AS trainedAt
      FROM ml_models
      WHERE channel_id = @channelId
        AND target_metric = @targetMetric
        AND is_active = 1
      ORDER BY trained_at DESC, id DESC
      LIMIT 1
    `,
  );

  const predictionStmt = db.prepare<{ modelId: number }, ForecastPredictionRow>(
    `
      SELECT
        prediction_date AS predictionDate,
        horizon_days AS horizonDays,
        predicted_value AS predictedValue,
        p10,
        p50,
        p90
      FROM ml_predictions
      WHERE model_id = @modelId
      ORDER BY horizon_days ASC, prediction_date ASC, id ASC
    `,
  );

  try {
    const model = modelStmt.get({ channelId, targetMetric });
    if (!model) {
      return ok({
        channelId,
        targetMetric,
        modelType: null,
        trainedAt: null,
        points: [],
      });
    }

    const parsedModelType = MlModelTypeSchema.safeParse(model.modelType);
    if (!parsedModelType.success) {
      return err(
        AppError.create(
          'REPORT_FORECAST_MODEL_INVALID',
          'Model prognozy ma niepoprawny typ.',
          'error',
          {
            channelId,
            targetMetric,
            modelType: model.modelType,
            issues: parsedModelType.error.issues,
          },
        ),
      );
    }

    const points = predictionStmt.all({ modelId: model.modelId });
    const parsedPoints = [];
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const parsedPoint = MlForecastPointDTOSchema.safeParse({
        date: point?.predictionDate,
        horizonDays: point?.horizonDays,
        predicted: point?.predictedValue,
        p10: point?.p10,
        p50: point?.p50,
        p90: point?.p90,
      });
      if (!parsedPoint.success) {
        return err(
          AppError.create(
            'REPORT_FORECAST_POINT_INVALID',
            'Punkt prognozy ma niepoprawny format.',
            'error',
            {
              channelId,
              targetMetric,
              pointIndex: index,
              issues: parsedPoint.error.issues,
            },
          ),
        );
      }
      parsedPoints.push(parsedPoint.data);
    }

    return ok({
      channelId,
      targetMetric,
      modelType: parsedModelType.data,
      trainedAt: model.trainedAt,
      points: parsedPoints,
    });
  } catch (cause) {
    return err(
      AppError.create(
        'REPORT_FORECAST_READ_FAILED',
        'Nie udalo sie odczytac prognozy do raportu.',
        'error',
        { channelId, targetMetric },
        toError(cause),
      ),
    );
  }
}

function readTopVideos(
  db: DatabaseConnection['db'],
  channelId: string,
  limit: number,
): Result<ReportTopVideoDTO[], AppError> {
  const stmt = db.prepare<{ channelId: string; limit: number }, TopVideoRow>(
    `
      SELECT
        video_id AS videoId,
        title,
        published_at AS publishedAt,
        view_count AS viewCount,
        like_count AS likeCount,
        comment_count AS commentCount
      FROM dim_video
      WHERE channel_id = @channelId
      ORDER BY view_count DESC, like_count DESC, published_at DESC, video_id ASC
      LIMIT @limit
    `,
  );

  try {
    const rows = stmt.all({ channelId, limit });
    const parsedRows: ReportTopVideoDTO[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const parsed = ReportTopVideoDTOSchema.safeParse(row);
      if (!parsed.success) {
        return err(
          AppError.create(
            'REPORT_TOP_VIDEOS_INVALID',
            'Lista top filmow ma niepoprawny format.',
            'error',
            { channelId, rowIndex: index, issues: parsed.error.issues },
          ),
        );
      }
      parsedRows.push(parsed.data);
    }

    return ok(parsedRows);
  } catch (cause) {
    return err(
      AppError.create(
        'REPORT_TOP_VIDEOS_READ_FAILED',
        'Nie udalo sie odczytac top filmow.',
        'error',
        { channelId, limit },
        toError(cause),
      ),
    );
  }
}

function buildInsights(input: {
  kpis: ReportGenerateResultDTO['kpis'];
  timeseries: ReportGenerateResultDTO['timeseries'];
  forecast: MlForecastResultDTO;
}): ReportInsightDTO[] {
  const insights: ReportInsightDTO[] = [];

  if (input.kpis.viewsDelta > 0) {
    insights.push({
      code: 'INSIGHT_VIEWS_POSITIVE',
      title: 'Wyświetlenia rosną',
      description: `W badanym zakresie wyświetlenia wzrosły o ${String(input.kpis.viewsDelta)}.`,
      severity: 'good',
    });
  } else if (input.kpis.viewsDelta < 0) {
    insights.push({
      code: 'INSIGHT_VIEWS_NEGATIVE',
      title: 'Wyświetlenia spadają',
      description: `W badanym zakresie wyświetlenia spadły o ${String(Math.abs(input.kpis.viewsDelta))}.`,
      severity: 'warning',
    });
  } else {
    insights.push({
      code: 'INSIGHT_VIEWS_FLAT',
      title: 'Wyświetlenia stabilne',
      description: 'W badanym zakresie wyświetlenia pozostały na podobnym poziomie.',
      severity: 'neutral',
    });
  }

  if (input.kpis.subscribersDelta > 0) {
    insights.push({
      code: 'INSIGHT_SUBSCRIBERS_UP',
      title: 'Przyrost subskrybentów',
      description: `Kanał zyskał ${String(input.kpis.subscribersDelta)} subskrybentów.`,
      severity: 'good',
    });
  } else if (input.kpis.subscribersDelta < 0) {
    insights.push({
      code: 'INSIGHT_SUBSCRIBERS_DOWN',
      title: 'Odpływ subskrybentów',
      description: `Kanał stracił ${String(Math.abs(input.kpis.subscribersDelta))} subskrybentów.`,
      severity: 'warning',
    });
  } else {
    insights.push({
      code: 'INSIGHT_SUBSCRIBERS_STABLE',
      title: 'Stabilna baza subskrybentów',
      description: 'Liczba subskrybentów nie zmieniła się istotnie.',
      severity: 'neutral',
    });
  }

  const latestActual = input.timeseries.points[input.timeseries.points.length - 1];
  const firstForecast = input.forecast.points[0];
  if (latestActual && firstForecast) {
    if (firstForecast.p50 > latestActual.value * 1.05) {
      insights.push({
        code: 'INSIGHT_FORECAST_UP',
        title: 'Prognoza sygnalizuje wzrost',
        description: 'Najbliższa prognoza p50 jest wyższa od ostatniego punktu szeregu.',
        severity: 'good',
      });
    } else if (firstForecast.p50 < latestActual.value * 0.95) {
      insights.push({
        code: 'INSIGHT_FORECAST_DOWN',
        title: 'Prognoza sygnalizuje spadek',
        description: 'Najbliższa prognoza p50 jest niższa od ostatniego punktu szeregu.',
        severity: 'warning',
      });
    } else {
      insights.push({
        code: 'INSIGHT_FORECAST_FLAT',
        title: 'Prognoza stabilna',
        description: 'Najbliższa prognoza p50 pozostaje blisko bieżącego poziomu.',
        severity: 'neutral',
      });
    }
  } else {
    insights.push({
      code: 'INSIGHT_FORECAST_MISSING',
      title: 'Brak aktywnej prognozy',
      description: 'Aby zobaczyć prognozy, uruchom trenowanie ML baseline (Faza 6).',
      severity: 'neutral',
    });
  }

  return insights;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pl-PL').format(value);
}

function toCsvValue(value: string | number): string {
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  return rows.map((row) => row.map((value) => toCsvValue(value)).join(',')).join('\n');
}

function buildTimeseriesCsv(report: ReportGenerateResultDTO): string {
  const rows: Array<Array<string | number>> = [['date', 'value']];
  for (const point of report.timeseries.points) {
    rows.push([point.date, point.value]);
  }
  return toCsv(rows);
}

function buildPredictionsCsv(report: ReportGenerateResultDTO): string {
  const rows: Array<Array<string | number>> = [['date', 'horizon_days', 'predicted', 'p10', 'p50', 'p90']];
  for (const point of report.forecast.points) {
    rows.push([point.date, point.horizonDays, point.predicted, point.p10, point.p50, point.p90]);
  }
  return toCsv(rows);
}

function buildTopVideosCsv(report: ReportGenerateResultDTO): string {
  const rows: Array<Array<string | number>> = [['video_id', 'title', 'published_at', 'view_count', 'like_count', 'comment_count']];
  for (const row of report.topVideos) {
    rows.push([row.videoId, row.title, row.publishedAt, row.viewCount, row.likeCount, row.commentCount]);
  }
  return toCsv(rows);
}

export function renderDashboardReportHtml(report: ReportGenerateResultDTO): string {
  const insightsHtml = report.insights
    .map((insight) => `<li><strong>${escapeHtml(insight.title)}</strong>: ${escapeHtml(insight.description)}</li>`)
    .join('');

  const topVideosRows = report.topVideos
    .map((video) => `
      <tr>
        <td>${escapeHtml(video.title)}</td>
        <td>${formatNumber(video.viewCount)}</td>
        <td>${formatNumber(video.likeCount)}</td>
        <td>${formatNumber(video.commentCount)}</td>
      </tr>
    `)
    .join('');

  const forecastRows = report.forecast.points
    .map((point) => `
      <tr>
        <td>${point.date}</td>
        <td>${formatNumber(point.p10)}</td>
        <td>${formatNumber(point.p50)}</td>
        <td>${formatNumber(point.p90)}</td>
      </tr>
    `)
    .join('');

  return `
<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <title>Raport Mozetobedzieto</title>
  <style>
    body { font-family: "Trebuchet MS", "Segoe UI", sans-serif; margin: 24px; color: #1f2a37; }
    h1, h2 { margin-bottom: 8px; }
    .muted { color: #5f6d7a; margin-top: 0; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
    .kpi { border: 1px solid #dde3ea; border-radius: 10px; padding: 12px; background: #f8fbff; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0 24px; }
    th, td { border: 1px solid #dde3ea; padding: 8px; text-align: left; }
    th { background: #eef4fb; }
  </style>
</head>
<body>
  <h1>Raport kanału: ${escapeHtml(report.channel.name)}</h1>
  <p class="muted">Zakres: ${report.range.dateFrom} - ${report.range.dateTo} (${String(report.range.days)} dni)</p>

  <h2>KPI</h2>
  <div class="kpi-grid">
    <div class="kpi"><strong>Wyświetlenia</strong><br/>${formatNumber(report.kpis.views)}</div>
    <div class="kpi"><strong>Delta wyświetleń</strong><br/>${formatNumber(report.kpis.viewsDelta)}</div>
    <div class="kpi"><strong>Subskrybenci</strong><br/>${formatNumber(report.kpis.subscribers)}</div>
    <div class="kpi"><strong>Engagement</strong><br/>${formatPercent(report.kpis.engagementRate)}</div>
  </div>

  <h2>Insighty</h2>
  <ul>${insightsHtml}</ul>

  <h2>Top filmy</h2>
  <table>
    <thead>
      <tr><th>Tytuł</th><th>Wyświetlenia</th><th>Polubienia</th><th>Komentarze</th></tr>
    </thead>
    <tbody>${topVideosRows}</tbody>
  </table>

  <h2>Prognoza (${escapeHtml(report.forecast.modelType ?? 'brak modelu')})</h2>
  <table>
    <thead>
      <tr><th>Data</th><th>p10</th><th>p50</th><th>p90</th></tr>
    </thead>
    <tbody>${forecastRows}</tbody>
  </table>
</body>
</html>
  `.trim();
}

function writeExportFile(
  exportDir: string,
  fileName: string,
  content: string,
): Result<ReportExportResultDTO['files'][number], AppError> {
  const filePath = path.join(exportDir, fileName);
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return ok({
      kind: fileName,
      path: filePath,
      sizeBytes: Buffer.byteLength(content, 'utf8'),
    });
  } catch (cause) {
    return err(
      AppError.create(
        'REPORT_EXPORT_WRITE_FAILED',
        'Nie udalo sie zapisac pliku raportu.',
        'error',
        { filePath },
        toError(cause),
      ),
    );
  }
}

function sanitizeTimestamp(value: string): string {
  return value.replaceAll(':', '-').replaceAll('.', '-');
}

export function generateDashboardReport(input: GenerateDashboardReportInput): Result<ReportGenerateResultDTO, AppError> {
  const parsedInput = ReportGenerateInputDTOSchema.safeParse({
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    targetMetric: input.targetMetric,
  });
  if (!parsedInput.success) {
    return err(
      AppError.create(
        'REPORT_INVALID_INPUT',
        'Parametry raportu sa niepoprawne.',
        'error',
        { issues: parsedInput.error.issues },
      ),
    );
  }

  const validatedInput = parsedInput.data;
  const rangeResult = buildDateRangeSummary(validatedInput.dateFrom, validatedInput.dateTo);
  if (!rangeResult.ok) {
    return rangeResult;
  }

  const channelQueries = createChannelQueries(input.db);
  const metricsQueries = createMetricsQueries(input.db);

  const channelResult = channelQueries.getChannelInfo({ channelId: validatedInput.channelId });
  if (!channelResult.ok) {
    return channelResult;
  }

  const kpisResult = metricsQueries.getKpis({
    channelId: validatedInput.channelId,
    dateFrom: validatedInput.dateFrom,
    dateTo: validatedInput.dateTo,
  });
  if (!kpisResult.ok) {
    return kpisResult;
  }

  const timeseriesResult = metricsQueries.getTimeseries({
    channelId: validatedInput.channelId,
    metric: validatedInput.targetMetric,
    dateFrom: validatedInput.dateFrom,
    dateTo: validatedInput.dateTo,
    granularity: 'day',
  });
  if (!timeseriesResult.ok) {
    return timeseriesResult;
  }

  const forecastResult = readActiveForecast(
    input.db,
    validatedInput.channelId,
    validatedInput.targetMetric,
  );
  if (!forecastResult.ok) {
    return forecastResult;
  }

  const topVideosResult = readTopVideos(input.db, validatedInput.channelId, 10);
  if (!topVideosResult.ok) {
    return topVideosResult;
  }

  const reportPayload: ReportGenerateResultDTO = {
    generatedAt: new Date().toISOString(),
    channel: {
      channelId: channelResult.value.channelId,
      name: channelResult.value.name,
    },
    range: rangeResult.value,
    kpis: kpisResult.value,
    timeseries: timeseriesResult.value,
    forecast: forecastResult.value,
    topVideos: topVideosResult.value,
    insights: buildInsights({
      kpis: kpisResult.value,
      timeseries: timeseriesResult.value,
      forecast: forecastResult.value,
    }),
  };

  const parsedOutput = ReportGenerateResultDTOSchema.safeParse(reportPayload);
  if (!parsedOutput.success) {
    return err(
      AppError.create(
        'REPORT_INVALID_OUTPUT',
        'Wygenerowany raport ma niepoprawny format.',
        'error',
        { issues: parsedOutput.error.issues },
      ),
    );
  }

  return ok(parsedOutput.data);
}

export function exportDashboardReport(input: ExportDashboardReportInput): Result<ReportExportResultDTO, AppError> {
  const parsedInput = ReportExportInputDTOSchema.safeParse({
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    targetMetric: input.targetMetric,
    exportDir: input.exportDir,
    formats: input.formats,
  });
  if (!parsedInput.success) {
    return err(
      AppError.create(
        'REPORT_EXPORT_INVALID_INPUT',
        'Parametry eksportu raportu sa niepoprawne.',
        'error',
        { issues: parsedInput.error.issues },
      ),
    );
  }

  const reportResult = generateDashboardReport({
    db: input.db,
    channelId: parsedInput.data.channelId,
    dateFrom: parsedInput.data.dateFrom,
    dateTo: parsedInput.data.dateTo,
    targetMetric: parsedInput.data.targetMetric,
  });
  if (!reportResult.ok) {
    return reportResult;
  }

  const baseDir = parsedInput.data.exportDir
    ? path.resolve(parsedInput.data.exportDir)
    : path.join(process.cwd(), 'exports', 'reports');
  const reportDir = path.join(
    baseDir,
    `${parsedInput.data.channelId}-${sanitizeTimestamp(reportResult.value.generatedAt)}`,
  );

  try {
    fs.mkdirSync(reportDir, { recursive: true });
  } catch (cause) {
    return err(
      AppError.create(
        'REPORT_EXPORT_DIR_CREATE_FAILED',
        'Nie udalo sie przygotowac katalogu eksportu raportu.',
        'error',
        { reportDir },
        toError(cause),
      ),
    );
  }

  const files: ReportExportResultDTO['files'] = [];
  const selectedFormats = Array.from(new Set(parsedInput.data.formats));

  if (selectedFormats.includes('json')) {
    const reportJson = writeExportFile(reportDir, 'report.json', JSON.stringify(reportResult.value, null, 2));
    if (!reportJson.ok) {
      return reportJson;
    }
    files.push(reportJson.value);

    const kpiJson = writeExportFile(reportDir, 'kpi_summary.json', JSON.stringify(reportResult.value.kpis, null, 2));
    if (!kpiJson.ok) {
      return kpiJson;
    }
    files.push(kpiJson.value);
  }

  if (selectedFormats.includes('csv')) {
    const timeseriesCsv = writeExportFile(reportDir, 'timeseries.csv', buildTimeseriesCsv(reportResult.value));
    if (!timeseriesCsv.ok) {
      return timeseriesCsv;
    }
    files.push(timeseriesCsv.value);

    const predictionsCsv = writeExportFile(reportDir, 'predictions.csv', buildPredictionsCsv(reportResult.value));
    if (!predictionsCsv.ok) {
      return predictionsCsv;
    }
    files.push(predictionsCsv.value);

    const topVideosCsv = writeExportFile(reportDir, 'top_videos.csv', buildTopVideosCsv(reportResult.value));
    if (!topVideosCsv.ok) {
      return topVideosCsv;
    }
    files.push(topVideosCsv.value);
  }

  if (selectedFormats.includes('html')) {
    const htmlFile = writeExportFile(reportDir, 'report.html', renderDashboardReportHtml(reportResult.value));
    if (!htmlFile.ok) {
      return htmlFile;
    }
    files.push(htmlFile.value);
  }

  const payload = {
    generatedAt: reportResult.value.generatedAt,
    exportDir: reportDir,
    files,
  };
  const parsedOutput = ReportExportResultDTOSchema.safeParse(payload);
  if (!parsedOutput.success) {
    return err(
      AppError.create(
        'REPORT_EXPORT_INVALID_OUTPUT',
        'Wynik eksportu raportu ma niepoprawny format.',
        'error',
        { issues: parsedOutput.error.issues },
      ),
    );
  }

  return ok(parsedOutput.data);
}
