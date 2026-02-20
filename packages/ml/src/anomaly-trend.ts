import { createMlQueries, createMlRepository, type DatabaseConnection } from '@moze/core';
import {
  AppError,
  err,
  ok,
  type MlAnomalyConfidence,
  type MlAnomalyListResultDTO,
  type MlAnomalyMethod,
  type MlAnomalyQueryInputDTO,
  type MlAnomalySeverity,
  type MlChangePointDTO,
  type MlDetectAnomaliesResultDTO,
  type MlTargetMetric,
  type MlTrendDirection,
  type MlTrendResultDTO,
  type Result,
} from '@moze/shared';
import { z } from 'zod/v4';

interface SeriesPoint {
  date: string;
  value: number;
}

interface DecompositionPoint extends SeriesPoint {
  trend: number;
  seasonal: number;
  residual: number;
}

interface ChangePointInternal {
  index: number;
  date: string;
  direction: 'up' | 'down';
  magnitude: number;
  score: number;
}

interface DetectedAnomaly {
  date: string;
  value: number;
  baseline: number;
  deviationRatio: number;
  zScore: number | null;
  method: MlAnomalyMethod;
  confidence: MlAnomalyConfidence;
  severity: MlAnomalySeverity;
  iqrLower: number;
  iqrUpper: number;
  explanation: string;
}

export interface RunAnomalyTrendAnalysisInput {
  db: DatabaseConnection['db'];
  channelId: string;
  targetMetric?: MlTargetMetric;
  dateFrom?: string | null;
  dateTo?: string | null;
  seasonalityPeriodDays?: number;
  sourceSyncRunId?: number | null;
  now?: () => Date;
}

export interface GetMlAnomaliesInput {
  db: DatabaseConnection['db'];
  channelId: string;
  targetMetric?: MlTargetMetric;
  dateFrom: string;
  dateTo: string;
  severities?: MlAnomalyQueryInputDTO['severities'];
}

export interface GetMlTrendInput {
  db: DatabaseConnection['db'];
  channelId: string;
  targetMetric?: MlTargetMetric;
  dateFrom: string;
  dateTo: string;
  seasonalityPeriodDays?: number;
}

const DEFAULT_SEASONALITY_DAYS = 7;
const SERIES_ROW_SCHEMA = z.object({
  date: z.iso.date(),
  value: z.number().nonnegative(),
});

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function createMlError(
  code: string,
  message: string,
  context: Record<string, unknown>,
  cause?: unknown,
): AppError {
  return AppError.create(code, message, 'error', context, cause ? toError(cause) : undefined);
}

function round(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 1_000_000) / 1_000_000;
}

function parseIsoDate(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00.000Z`);
}

function validateDateRange(
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
): Result<void, AppError> {
  if (!dateFrom || !dateTo) {
    return ok(undefined);
  }

  const from = parseIsoDate(dateFrom).getTime();
  const to = parseIsoDate(dateTo).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return err(
      createMlError('ML_TREND_INVALID_DATE', 'Zakres dat analizy trendu jest niepoprawny.', {
        dateFrom,
        dateTo,
      }),
    );
  }

  if (from > to) {
    return err(
      createMlError('ML_TREND_INVALID_RANGE', 'Data poczatkowa nie moze byc pozniejsza niz koncowa.', {
        dateFrom,
        dateTo,
      }),
    );
  }

  return ok(undefined);
}

function isWithinRange(date: string, dateFrom: string | null | undefined, dateTo: string | null | undefined): boolean {
  if (dateFrom && date < dateFrom) {
    return false;
  }
  if (dateTo && date > dateTo) {
    return false;
  }
  return true;
}

function readSeries(
  db: DatabaseConnection['db'],
  channelId: string,
  targetMetric: MlTargetMetric,
): Result<SeriesPoint[], AppError> {
  const mlQueries = createMlQueries(db);
  const rowsResult = mlQueries.getMetricSeries({ channelId, targetMetric });
  if (!rowsResult.ok) {
    return err(
      createMlError(
        'ML_TREND_SERIES_READ_FAILED',
        'Nie udalo sie odczytac szeregu czasowego do analizy trendu.',
        {
          channelId,
          targetMetric,
          causeErrorCode: rowsResult.error.code,
        },
        rowsResult.error,
      ),
    );
  }

  try {
    const points: SeriesPoint[] = [];
    for (let index = 0; index < rowsResult.value.length; index += 1) {
      const parsed = SERIES_ROW_SCHEMA.safeParse(rowsResult.value[index]);
      if (!parsed.success) {
        return err(
          createMlError(
            'ML_TREND_SERIES_INVALID',
            'Dane szeregu do analizy trendu maja niepoprawny format.',
            { channelId, targetMetric, rowIndex: index, issues: parsed.error.issues },
          ),
        );
      }
      points.push(parsed.data);
    }
    return ok(points);
  } catch (cause) {
    return err(
      createMlError(
        'ML_TREND_SERIES_READ_FAILED',
        'Nie udalo sie odczytac szeregu czasowego do analizy trendu.',
        { channelId, targetMetric },
        cause,
      ),
    );
  }
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function stdDev(values: readonly number[], sampleMean?: number): number {
  if (values.length === 0) {
    return 0;
  }
  const currentMean = sampleMean ?? mean(values);
  const variance = values.reduce((total, value) => total + (value - currentMean) ** 2, 0) / values.length;
  return Math.sqrt(Math.max(0, variance));
}

function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sorted[lower] ?? 0;
  }
  const weight = position - lower;
  const lowValue = sorted[lower] ?? 0;
  const highValue = sorted[upper] ?? lowValue;
  return lowValue + (highValue - lowValue) * weight;
}

function tricube(value: number): number {
  const absValue = Math.abs(value);
  if (absValue >= 1) {
    return 0;
  }
  return (1 - absValue ** 3) ** 3;
}

function loessSmooth(values: readonly number[], spanRatio = 0.25): number[] {
  const n = values.length;
  if (n === 0) {
    return [];
  }
  if (n <= 2) {
    return [...values];
  }

  const span = Math.max(3, Math.min(n, Math.round(n * spanRatio)));
  const radius = Math.floor(span / 2);
  const smoothed: number[] = [];

  for (let index = 0; index < n; index += 1) {
    let start = Math.max(0, index - radius);
    let end = Math.min(n - 1, index + radius);

    const currentSpan = end - start + 1;
    if (currentSpan < span) {
      if (start === 0) {
        end = Math.min(n - 1, start + span - 1);
      } else if (end === n - 1) {
        start = Math.max(0, end - span + 1);
      }
    }

    const maxDistance = Math.max(index - start, end - index, 1);
    let sumW = 0;
    let sumWX = 0;
    let sumWY = 0;
    let sumWXX = 0;
    let sumWXY = 0;

    for (let pointIndex = start; pointIndex <= end; pointIndex += 1) {
      const x = pointIndex - index;
      const y = values[pointIndex] ?? 0;
      const weight = tricube(x / maxDistance);
      sumW += weight;
      sumWX += weight * x;
      sumWY += weight * y;
      sumWXX += weight * x * x;
      sumWXY += weight * x * y;
    }

    if (sumW === 0) {
      smoothed.push(values[index] ?? 0);
      continue;
    }

    const denominator = sumW * sumWXX - sumWX * sumWX;
    if (denominator === 0) {
      smoothed.push(sumWY / sumW);
      continue;
    }

    const intercept = (sumWY * sumWXX - sumWX * sumWXY) / denominator;
    smoothed.push(intercept);
  }

  return smoothed;
}

function decomposeSeries(points: readonly SeriesPoint[], seasonalityPeriodDays: number): DecompositionPoint[] {
  const values = points.map((point) => point.value);
  const initialTrend = loessSmooth(values, 0.25);
  const detrended = values.map((value, index) => value - (initialTrend[index] ?? value));

  const seasonalPattern: number[] = [];
  for (let seasonIndex = 0; seasonIndex < seasonalityPeriodDays; seasonIndex += 1) {
    const bucket: number[] = [];
    for (let index = seasonIndex; index < detrended.length; index += seasonalityPeriodDays) {
      bucket.push(detrended[index] ?? 0);
    }
    seasonalPattern.push(mean(bucket));
  }
  const seasonalMean = mean(seasonalPattern);
  for (let index = 0; index < seasonalPattern.length; index += 1) {
    seasonalPattern[index] = (seasonalPattern[index] ?? 0) - seasonalMean;
  }

  const seasonal = values.map((_value, index) => seasonalPattern[index % seasonalityPeriodDays] ?? 0);
  const deseasonalized = values.map((value, index) => value - (seasonal[index] ?? 0));
  const trend = loessSmooth(deseasonalized, 0.25);
  const residual = values.map((value, index) => value - (trend[index] ?? value) - (seasonal[index] ?? 0));

  return points.map((point, index) => ({
    date: point.date,
    value: point.value,
    trend: round(trend[index] ?? point.value),
    seasonal: round(seasonal[index] ?? 0),
    residual: round(residual[index] ?? 0),
  }));
}

function deduplicateChangePoints(changePoints: readonly ChangePointInternal[], minDistance: number): ChangePointInternal[] {
  if (changePoints.length <= 1) {
    return [...changePoints];
  }

  const result: ChangePointInternal[] = [];
  for (const point of changePoints) {
    const previous = result[result.length - 1];
    if (!previous) {
      result.push(point);
      continue;
    }

    if (point.index - previous.index > minDistance) {
      result.push(point);
      continue;
    }

    if (point.score > previous.score) {
      result[result.length - 1] = point;
    }
  }
  return result;
}

function detectChangePoints(
  decomposition: readonly DecompositionPoint[],
  seasonalityPeriodDays: number,
): ChangePointInternal[] {
  if (decomposition.length < 12) {
    return [];
  }

  const deseasonalized = decomposition.map((point) => point.value - point.seasonal);
  const baselineWindow = Math.max(8, Math.min(21, Math.floor(deseasonalized.length * 0.2)));

  let baselineSlice = deseasonalized.slice(0, baselineWindow);
  let baselineMean = mean(baselineSlice);
  let baselineStd = stdDev(baselineSlice, baselineMean);
  if (baselineStd === 0) {
    baselineStd = Math.max(1, baselineMean * 0.02);
  }

  let driftAllowance = baselineStd * 0.5;
  let threshold = baselineStd * 5;
  if (threshold === 0) {
    threshold = Math.max(5, baselineMean * 0.1);
    driftAllowance = Math.max(1, baselineMean * 0.02);
  }

  const rawChangePoints: ChangePointInternal[] = [];
  let positiveCusum = 0;
  let negativeCusum = 0;

  for (let index = baselineWindow; index < deseasonalized.length; index += 1) {
    const value = deseasonalized[index] ?? baselineMean;
    positiveCusum = Math.max(0, positiveCusum + (value - baselineMean - driftAllowance));
    negativeCusum = Math.min(0, negativeCusum + (value - baselineMean + driftAllowance));

    if (positiveCusum <= threshold && negativeCusum >= -threshold) {
      continue;
    }

    const direction: 'up' | 'down' = positiveCusum > threshold ? 'up' : 'down';
    const score = Math.abs(direction === 'up' ? positiveCusum : negativeCusum) / Math.max(threshold, 1);
    const magnitude = value - baselineMean;
    rawChangePoints.push({
      index,
      date: decomposition[index]?.date ?? decomposition[decomposition.length - 1]?.date ?? '',
      direction,
      magnitude: round(magnitude),
      score: round(score),
    });

    positiveCusum = 0;
    negativeCusum = 0;
    const recalibrationStart = Math.max(0, index - baselineWindow + 1);
    baselineSlice = deseasonalized.slice(recalibrationStart, index + 1);
    baselineMean = mean(baselineSlice);
    baselineStd = stdDev(baselineSlice, baselineMean);
    if (baselineStd === 0) {
      baselineStd = Math.max(1, baselineMean * 0.02);
    }
    driftAllowance = baselineStd * 0.5;
    threshold = Math.max(baselineStd * 5, 1);
  }

  const deduplicationDistance = Math.max(2, Math.floor(seasonalityPeriodDays / 2));
  return deduplicateChangePoints(rawChangePoints, deduplicationDistance);
}

function toSeverity(deviationRatio: number, zScore: number | null): MlAnomalySeverity {
  const absDeviation = Math.abs(deviationRatio);
  const absZ = Math.abs(zScore ?? 0);
  if (absDeviation >= 1 || absZ >= 5) {
    return 'critical';
  }
  if (absDeviation >= 0.5 || absZ >= 4) {
    return 'high';
  }
  if (absDeviation >= 0.25 || absZ >= 3) {
    return 'medium';
  }
  return 'low';
}

function toConfidence(method: MlAnomalyMethod, zScore: number | null, deviationRatio: number): MlAnomalyConfidence {
  if (method === 'consensus') {
    return 'high';
  }
  const absZ = Math.abs(zScore ?? 0);
  const absDeviation = Math.abs(deviationRatio);
  if (absZ >= 4 || absDeviation >= 0.5) {
    return 'medium';
  }
  return 'low';
}

function toMetricLabel(targetMetric: MlTargetMetric): string {
  return targetMetric === 'subscribers' ? 'Subskrypcje' : 'Wyswietlenia';
}

function createAnomalyExplanation(
  input: {
    targetMetric: MlTargetMetric;
    deviationRatio: number;
    baseline: number;
    value: number;
    daysSinceLastVideo: number | null;
  },
): string {
  const metricLabel = toMetricLabel(input.targetMetric);
  const percent = Math.abs(input.deviationRatio * 100).toFixed(1).replace('.', ',');
  const directionLabel = input.deviationRatio >= 0 ? 'wzrosly' : 'spadly';
  let explanation = `${metricLabel} ${directionLabel} o ${percent}% wzgledem 7-dniowej sredniej (${Math.round(input.baseline)}).`;

  if (input.targetMetric === 'views') {
    if (input.daysSinceLastVideo !== null && input.daysSinceLastVideo >= 5 && input.deviationRatio < 0) {
      explanation = `${explanation} Prawdopodobna przyczyna: brak publikacji od ${String(input.daysSinceLastVideo)} dni.`;
    } else if (input.daysSinceLastVideo !== null && input.daysSinceLastVideo <= 1 && input.deviationRatio > 0) {
      explanation = `${explanation} Mozliwa przyczyna: swieza publikacja materialu.`;
    }
  }

  if (input.baseline === 0 && input.value > 0) {
    explanation = `${metricLabel} pojawily sie po okresie bez aktywnosci.`;
  }

  return explanation;
}

function readDaysSinceLastVideoMap(
  db: DatabaseConnection['db'],
  channelId: string,
): Result<Map<string, number | null>, AppError> {
  const mlQueries = createMlQueries(db);
  const rowsResult = mlQueries.getDaysSinceLastVideoByDate({ channelId });
  if (rowsResult.ok) {
    return rowsResult;
  }

  return err(
    createMlError(
      'ML_FEATURES_READ_FAILED',
      'Nie udalo sie odczytac cech pipeline do opisu anomalii.',
      {
        channelId,
        causeErrorCode: rowsResult.error.code,
      },
      rowsResult.error,
    ),
  );
}

function detectAnomalies(
  points: readonly SeriesPoint[],
  targetMetric: MlTargetMetric,
  daysSinceLastVideoByDate: Map<string, number | null>,
): DetectedAnomaly[] {
  if (points.length === 0) {
    return [];
  }

  const values = points.map((point) => point.value);
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const iqr = q3 - q1;
  const iqrLower = q1 - 1.5 * iqr;
  const iqrUpper = q3 + 1.5 * iqr;
  const anomalies: DetectedAnomaly[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!point) {
      continue;
    }

    const baselineWindowStart = Math.max(0, index - 7);
    const baselineWindow = points.slice(baselineWindowStart, index).map((item) => item.value);
    const baseline = baselineWindow.length === 0 ? point.value : mean(baselineWindow);
    let baselineStd = stdDev(baselineWindow, baseline);
    if (baselineStd === 0) {
      baselineStd = Math.max(1, baseline * 0.05);
    }

    const deviation = point.value - baseline;
    const deviationRatio = baseline === 0 ? (point.value > 0 ? 1 : 0) : deviation / baseline;
    const zScore = baselineStd > 0 ? deviation / baselineStd : null;
    const zScoreFlag = zScore !== null && Math.abs(zScore) >= 2.8;
    const iqrFlag = point.value < iqrLower || point.value > iqrUpper;

    if (!zScoreFlag && !iqrFlag) {
      continue;
    }

    const method: MlAnomalyMethod = zScoreFlag && iqrFlag
      ? 'consensus'
      : zScoreFlag
        ? 'zscore'
        : 'iqr';
    const severity = toSeverity(deviationRatio, zScore);
    const confidence = toConfidence(method, zScore, deviationRatio);
    const explanation = createAnomalyExplanation({
      targetMetric,
      deviationRatio,
      baseline,
      value: point.value,
      daysSinceLastVideo: daysSinceLastVideoByDate.get(point.date) ?? null,
    });

    anomalies.push({
      date: point.date,
      value: point.value,
      baseline: Math.max(0, baseline),
      deviationRatio: round(deviationRatio),
      zScore: zScore === null ? null : round(zScore),
      method,
      confidence,
      severity,
      iqrLower: round(iqrLower),
      iqrUpper: round(iqrUpper),
      explanation,
    });
  }

  return anomalies;
}

function persistAnomalies(
  input: {
    db: DatabaseConnection['db'];
    channelId: string;
    targetMetric: MlTargetMetric;
    anomalies: readonly DetectedAnomaly[];
    dateFrom?: string | null;
    dateTo?: string | null;
    detectedAt: string;
    sourceSyncRunId: number | null;
  },
): Result<void, AppError> {
  const mlRepository = createMlRepository(input.db);
  const transactionResult = mlRepository.runInTransaction(() => {
    const deleteResult = mlRepository.deleteAnomalies({
      channelId: input.channelId,
      targetMetric: input.targetMetric,
      dateFrom: input.dateFrom ?? null,
      dateTo: input.dateTo ?? null,
    });
    if (!deleteResult.ok) {
      return deleteResult;
    }

    for (const anomaly of input.anomalies) {
      const insertResult = mlRepository.insertAnomaly({
        channelId: input.channelId,
        targetMetric: input.targetMetric,
        date: anomaly.date,
        metricValue: anomaly.value,
        baselineValue: anomaly.baseline,
        deviationRatio: anomaly.deviationRatio,
        zScore: anomaly.zScore,
        iqrLower: anomaly.iqrLower,
        iqrUpper: anomaly.iqrUpper,
        method: anomaly.method,
        confidence: anomaly.confidence,
        severity: anomaly.severity,
        explanation: anomaly.explanation,
        sourceSyncRunId: input.sourceSyncRunId,
        detectedAt: input.detectedAt,
      });
      if (!insertResult.ok) {
        return insertResult;
      }
    }

    return ok(undefined);
  });

  if (transactionResult.ok) {
    return ok(undefined);
  }

  return err(
    createMlError(
      'ML_ANOMALY_PERSIST_FAILED',
      'Nie udalo sie zapisac anomalii do bazy danych.',
      {
        channelId: input.channelId,
        targetMetric: input.targetMetric,
        anomalies: input.anomalies.length,
        causeErrorCode: transactionResult.error.code,
      },
      transactionResult.error,
    ),
  );
}

export function runAnomalyTrendAnalysis(
  input: RunAnomalyTrendAnalysisInput,
): Result<MlDetectAnomaliesResultDTO, AppError> {
  const targetMetric = input.targetMetric ?? 'views';
  const seasonalityPeriodDays = input.seasonalityPeriodDays ?? DEFAULT_SEASONALITY_DAYS;
  const now = input.now ?? (() => new Date());
  const generatedAt = now().toISOString();

  const rangeValidation = validateDateRange(input.dateFrom ?? null, input.dateTo ?? null);
  if (!rangeValidation.ok) {
    return rangeValidation;
  }

  const seriesResult = readSeries(input.db, input.channelId, targetMetric);
  if (!seriesResult.ok) {
    return seriesResult;
  }

  const allSeries = seriesResult.value;
  if (allSeries.length === 0) {
    return ok({
      channelId: input.channelId,
      targetMetric,
      analyzedPoints: 0,
      anomaliesDetected: 0,
      changePointsDetected: 0,
      generatedAt,
    });
  }

  const daysSinceLastVideoResult = readDaysSinceLastVideoMap(input.db, input.channelId);
  if (!daysSinceLastVideoResult.ok) {
    return daysSinceLastVideoResult;
  }

  const allAnomalies = detectAnomalies(allSeries, targetMetric, daysSinceLastVideoResult.value);
  const anomaliesInRange = allAnomalies.filter((anomaly) =>
    isWithinRange(anomaly.date, input.dateFrom ?? null, input.dateTo ?? null),
  );

  const decomposition = decomposeSeries(allSeries, seasonalityPeriodDays);
  const changePoints = detectChangePoints(decomposition, seasonalityPeriodDays).filter((changePoint) =>
    isWithinRange(changePoint.date, input.dateFrom ?? null, input.dateTo ?? null),
  );

  const persistResult = persistAnomalies({
    db: input.db,
    channelId: input.channelId,
    targetMetric,
    anomalies: anomaliesInRange,
    dateFrom: input.dateFrom ?? null,
    dateTo: input.dateTo ?? null,
    detectedAt: generatedAt,
    sourceSyncRunId: input.sourceSyncRunId ?? null,
  });
  if (!persistResult.ok) {
    return persistResult;
  }

  const analyzedPoints = allSeries.filter((point) =>
    isWithinRange(point.date, input.dateFrom ?? null, input.dateTo ?? null),
  ).length;

  return ok({
    channelId: input.channelId,
    targetMetric,
    analyzedPoints,
    anomaliesDetected: anomaliesInRange.length,
    changePointsDetected: changePoints.length,
    generatedAt,
  });
}

export function getMlAnomalies(input: GetMlAnomaliesInput): Result<MlAnomalyListResultDTO, AppError> {
  const targetMetric = input.targetMetric ?? 'views';
  const rangeValidation = validateDateRange(input.dateFrom, input.dateTo);
  if (!rangeValidation.ok) {
    return rangeValidation;
  }

  const normalizedSeverities = input.severities?.filter((severity) => severity.length > 0) ?? [];
  const mlQueries = createMlQueries(input.db);
  const rowsResult = mlQueries.getPersistedAnomalies({
    channelId: input.channelId,
    targetMetric,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    severities: normalizedSeverities,
  });
  if (!rowsResult.ok) {
    return err(
      createMlError(
        'ML_ANOMALY_READ_FAILED',
        'Nie udalo sie odczytac zapisanych anomalii.',
        {
          channelId: input.channelId,
          targetMetric,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          severities: normalizedSeverities,
          causeErrorCode: rowsResult.error.code,
        },
        rowsResult.error,
      ),
    );
  }

  return ok({
    channelId: input.channelId,
    targetMetric,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    total: rowsResult.value.length,
    items: rowsResult.value,
  });
}

function toTrendDirection(delta: number, average: number): MlTrendDirection {
  const threshold = Math.max(1, Math.abs(average) * 0.01);
  if (Math.abs(delta) <= threshold) {
    return 'flat';
  }
  return delta > 0 ? 'up' : 'down';
}

export function getMlTrend(input: GetMlTrendInput): Result<MlTrendResultDTO, AppError> {
  const targetMetric = input.targetMetric ?? 'views';
  const seasonalityPeriodDays = input.seasonalityPeriodDays ?? DEFAULT_SEASONALITY_DAYS;
  const rangeValidation = validateDateRange(input.dateFrom, input.dateTo);
  if (!rangeValidation.ok) {
    return rangeValidation;
  }

  const seriesResult = readSeries(input.db, input.channelId, targetMetric);
  if (!seriesResult.ok) {
    return seriesResult;
  }

  const allPoints = seriesResult.value;
  if (allPoints.length === 0) {
    return ok({
      channelId: input.channelId,
      targetMetric,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      seasonalityPeriodDays,
      summary: {
        trendDirection: 'flat',
        trendDelta: 0,
      },
      points: [],
      changePoints: [],
    });
  }

  const decomposition = decomposeSeries(allPoints, seasonalityPeriodDays);
  const allChangePoints = detectChangePoints(decomposition, seasonalityPeriodDays);

  const pointsInRange = decomposition.filter((point) => isWithinRange(point.date, input.dateFrom, input.dateTo));
  const changePointMap = new Map<string, ChangePointInternal>();
  for (const changePoint of allChangePoints) {
    if (!isWithinRange(changePoint.date, input.dateFrom, input.dateTo)) {
      continue;
    }
    changePointMap.set(changePoint.date, changePoint);
  }

  const trendStart = pointsInRange[0]?.trend ?? 0;
  const trendEnd = pointsInRange[pointsInRange.length - 1]?.trend ?? trendStart;
  const trendDelta = round(trendEnd - trendStart);
  const trendAverage = mean(pointsInRange.map((point) => point.trend));

  const changePoints: MlChangePointDTO[] = Array.from(changePointMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((changePoint) => ({
      date: changePoint.date,
      direction: changePoint.direction,
      magnitude: round(changePoint.magnitude),
      score: round(changePoint.score),
    }));

  return ok({
    channelId: input.channelId,
    targetMetric,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    seasonalityPeriodDays,
    summary: {
      trendDirection: toTrendDirection(trendDelta, trendAverage),
      trendDelta,
    },
    points: pointsInRange.map((point) => ({
      date: point.date,
      value: point.value,
      trend: point.trend,
      seasonal: point.seasonal,
      residual: point.residual,
      isChangePoint: changePointMap.has(point.date),
    })),
    changePoints,
  });
}
