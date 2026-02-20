import { createMlQueries, createMlRepository, type DatabaseConnection } from '@moze/core';
import {
  AppError,
  err,
  ok,
  type MlForecastPointDTO,
  type MlForecastResultDTO,
  type MlModelRunSummaryDTO,
  type MlModelStatus,
  type MlRunBaselineResultDTO,
  type MlTargetMetric,
  type Result,
} from '@moze/shared';
import { z } from 'zod/v4';

type MlModelType = 'holt-winters' | 'linear-regression';

interface SeriesPoint {
  date: string;
  value: number;
}

interface ModelState {
  modelType: MlModelType;
  version: string;
  config: Record<string, unknown>;
  predict: (horizonDays: number) => number;
}

interface BacktestMetrics {
  mae: number;
  smape: number;
  mase: number;
  sampleSize: number;
  residualStdDev: number;
}

interface ModelEvaluation {
  modelType: MlModelType;
  version: string;
  config: Record<string, unknown>;
  status: MlModelStatus;
  metrics: BacktestMetrics;
  predictions: MlForecastPointDTO[];
}

interface PersistedModelEvaluation extends ModelEvaluation {
  modelId: number;
}

export interface QualityGateConfig {
  smapeMax: number;
  maseMax: number;
}

export interface RunMlBaselineInput {
  db: DatabaseConnection['db'];
  channelId: string;
  targetMetric?: MlTargetMetric;
  horizonDays?: number;
  minHistoryDays?: number;
  qualityGate?: Partial<QualityGateConfig>;
  sourceSyncRunId?: number | null;
  now?: () => Date;
}

export interface GetMlForecastInput {
  db: DatabaseConnection['db'];
  channelId: string;
  targetMetric?: MlTargetMetric;
}

const DEFAULT_HORIZON_DAYS = 7;
const DEFAULT_MIN_HISTORY_DAYS = 30;
const DEFAULT_QUALITY_GATE: QualityGateConfig = {
  smapeMax: 0.35,
  maseMax: 2,
};
const Z_SCORE_P10_P90 = 1.28155;

const SeriesPointRowSchema = z.object({
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

function clampNonNegative(value: number): number {
  return Math.max(0, value);
}

function roundMetric(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 1_000_000) / 1_000_000;
}

function shiftIsoDate(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
        'ML_SERIES_READ_FAILED',
        'Nie udalo sie odczytac szeregu czasowego do trenowania modelu.',
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
    const parsedRows: SeriesPoint[] = [];
    for (let index = 0; index < rowsResult.value.length; index += 1) {
      const row = rowsResult.value[index];
      const parsed = SeriesPointRowSchema.safeParse(row);
      if (!parsed.success) {
        return err(
          createMlError(
            'ML_SERIES_ROW_INVALID',
            'Dane szeregu czasowego maja niepoprawny format.',
            { channelId, targetMetric, rowIndex: index, issues: parsed.error.issues },
          ),
        );
      }
      parsedRows.push(parsed.data);
    }

    return ok(parsedRows);
  } catch (cause) {
    return err(
      createMlError(
        'ML_SERIES_ROW_PARSE_FAILED',
        'Nie udalo sie przetworzyc szeregu czasowego do trenowania modelu.',
        { channelId, targetMetric },
        cause,
      ),
    );
  }
}

function trainLinearRegression(values: readonly number[]): ModelState {
  const n = values.length;
  if (n === 0) {
    return {
      modelType: 'linear-regression',
      version: 'v1',
      config: { strategy: 'trend-line', slope: 0, intercept: 0 },
      predict: () => 0,
    };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let index = 0; index < n; index += 1) {
    const x = index;
    const y = values[index] ?? 0;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = n === 0 ? 0 : (sumY - slope * sumX) / n;

  return {
    modelType: 'linear-regression',
    version: 'v1',
    config: {
      strategy: 'trend-line',
      slope: roundMetric(slope),
      intercept: roundMetric(intercept),
    },
    predict: (horizonDays: number) => {
      const x = n - 1 + horizonDays;
      return clampNonNegative(intercept + slope * x);
    },
  };
}

function trainHoltWinters(values: readonly number[]): ModelState {
  if (values.length === 0) {
    return {
      modelType: 'holt-winters',
      version: 'v1',
      config: { strategy: 'double-exponential', alpha: 0.4, beta: 0.2, level: 0, trend: 0 },
      predict: () => 0,
    };
  }

  const alpha = 0.4;
  const beta = 0.2;
  let level = values[0] ?? 0;
  let trend = values.length >= 2 ? (values[1] ?? level) - level : 0;

  for (let index = 1; index < values.length; index += 1) {
    const value = values[index] ?? level;
    const previousLevel = level;
    level = alpha * value + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
  }

  return {
    modelType: 'holt-winters',
    version: 'v1',
    config: {
      strategy: 'double-exponential',
      alpha,
      beta,
      level: roundMetric(level),
      trend: roundMetric(trend),
    },
    predict: (horizonDays: number) => {
      return clampNonNegative(level + horizonDays * trend);
    },
  };
}

function trainModel(modelType: MlModelType, values: readonly number[]): ModelState {
  if (modelType === 'holt-winters') {
    return trainHoltWinters(values);
  }
  return trainLinearRegression(values);
}

function calculateBacktestMetrics(
  series: readonly SeriesPoint[],
  modelType: MlModelType,
  minHistoryDays: number,
): BacktestMetrics {
  const values = series.map((point) => point.value);
  const residuals: number[] = [];
  const absoluteErrors: number[] = [];
  const smapeTerms: number[] = [];

  for (let splitIndex = minHistoryDays; splitIndex < values.length; splitIndex += 1) {
    const trainValues = values.slice(0, splitIndex);
    const model = trainModel(modelType, trainValues);
    const predicted = clampNonNegative(model.predict(1));
    const actual = values[splitIndex] ?? 0;
    const residual = actual - predicted;
    residuals.push(residual);
    absoluteErrors.push(Math.abs(residual));

    const denominator = Math.abs(actual) + Math.abs(predicted);
    const smapeTerm = denominator === 0 ? 0 : (2 * Math.abs(actual - predicted)) / denominator;
    smapeTerms.push(smapeTerm);
  }

  const sampleSize = absoluteErrors.length;
  const mae = sampleSize === 0
    ? 0
    : absoluteErrors.reduce((total, current) => total + current, 0) / sampleSize;
  const smape = sampleSize === 0
    ? 0
    : smapeTerms.reduce((total, current) => total + current, 0) / sampleSize;

  const naiveDiffs: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const current = values[index] ?? 0;
    const previous = values[index - 1] ?? 0;
    naiveDiffs.push(Math.abs(current - previous));
  }
  const naiveScale = naiveDiffs.length === 0
    ? 0
    : naiveDiffs.reduce((total, current) => total + current, 0) / naiveDiffs.length;
  const mase = naiveScale === 0 ? mae : mae / naiveScale;

  const residualMean = residuals.length === 0
    ? 0
    : residuals.reduce((total, current) => total + current, 0) / residuals.length;
  const residualVariance = residuals.length === 0
    ? 0
    : residuals.reduce((total, current) => total + (current - residualMean) ** 2, 0) / residuals.length;
  const residualStdDev = Math.sqrt(Math.max(0, residualVariance));

  return {
    mae: roundMetric(mae),
    smape: roundMetric(smape),
    mase: roundMetric(mase),
    sampleSize,
    residualStdDev: roundMetric(residualStdDev),
  };
}

function buildForecastPoints(
  model: ModelState,
  latestDate: string,
  horizonDays: number,
  residualStdDev: number,
): MlForecastPointDTO[] {
  const predictions: MlForecastPointDTO[] = [];

  for (let step = 1; step <= horizonDays; step += 1) {
    const p50 = clampNonNegative(model.predict(step));
    const margin = Z_SCORE_P10_P90 * residualStdDev * Math.sqrt(step);
    const p10 = clampNonNegative(p50 - margin);
    const p90 = clampNonNegative(p50 + margin);

    predictions.push({
      date: shiftIsoDate(latestDate, step),
      horizonDays: step,
      predicted: roundMetric(p50),
      p10: roundMetric(p10),
      p50: roundMetric(p50),
      p90: roundMetric(Math.max(p50, p90)),
    });
  }

  return predictions;
}

function evaluateModels(
  series: readonly SeriesPoint[],
  horizonDays: number,
  minHistoryDays: number,
  qualityGate: QualityGateConfig,
): ModelEvaluation[] {
  const latestPoint = series[series.length - 1];
  if (!latestPoint) {
    return [];
  }

  const evaluations: ModelEvaluation[] = [];
  for (const modelType of ['holt-winters', 'linear-regression'] as const) {
    const metrics = calculateBacktestMetrics(series, modelType, minHistoryDays);
    const model = trainModel(modelType, series.map((point) => point.value));
    const predictions = buildForecastPoints(model, latestPoint.date, horizonDays, metrics.residualStdDev);
    evaluations.push({
      modelType,
      version: model.version,
      config: model.config,
      status: 'rejected',
      metrics,
      predictions,
    });
  }

  evaluations.sort((a, b) => {
    if (a.metrics.smape === b.metrics.smape) {
      if (a.metrics.mae === b.metrics.mae) {
        return a.modelType.localeCompare(b.modelType);
      }
      return a.metrics.mae - b.metrics.mae;
    }
    return a.metrics.smape - b.metrics.smape;
  });

  const activeCandidate = evaluations.find((evaluation) => {
    return evaluation.metrics.smape <= qualityGate.smapeMax && evaluation.metrics.mase <= qualityGate.maseMax;
  });

  return evaluations.map((evaluation) => {
    const passesGate = evaluation.metrics.smape <= qualityGate.smapeMax
      && evaluation.metrics.mase <= qualityGate.maseMax;
    const status: MlModelStatus = !passesGate
      ? 'rejected'
      : activeCandidate && evaluation.modelType === activeCandidate.modelType
        ? 'active'
        : 'shadow';
    return {
      ...evaluation,
      status,
    };
  });
}

function persistEvaluations(
  input: {
    db: DatabaseConnection['db'];
    channelId: string;
    targetMetric: MlTargetMetric;
    sourceSyncRunId: number | null;
    trainedAt: string;
    evaluations: readonly ModelEvaluation[];
  },
): Result<PersistedModelEvaluation[], AppError> {
  const mlRepository = createMlRepository(input.db);
  const persisted: PersistedModelEvaluation[] = [];

  const transactionResult = mlRepository.runInTransaction(() => {
    const clearResult = mlRepository.clearActiveModels({
      channelId: input.channelId,
      targetMetric: input.targetMetric,
    });
    if (!clearResult.ok) {
      return clearResult;
    }

    for (const evaluation of input.evaluations) {
      const modelResult = mlRepository.insertModel({
        channelId: input.channelId,
        targetMetric: input.targetMetric,
        modelType: evaluation.modelType,
        version: evaluation.version,
        status: evaluation.status,
        isActive: evaluation.status === 'active' ? 1 : 0,
        configJson: JSON.stringify(evaluation.config),
        metricsJson: JSON.stringify({
          mae: evaluation.metrics.mae,
          smape: evaluation.metrics.smape,
          mase: evaluation.metrics.mase,
          sampleSize: evaluation.metrics.sampleSize,
        }),
        sourceSyncRunId: input.sourceSyncRunId,
        trainedAt: input.trainedAt,
      });
      if (!modelResult.ok) {
        return modelResult;
      }

      const insertBacktestResult = mlRepository.insertBacktest({
        modelId: modelResult.value,
        channelId: input.channelId,
        targetMetric: input.targetMetric,
        mae: evaluation.metrics.mae,
        smape: evaluation.metrics.smape,
        mase: evaluation.metrics.mase,
        sampleSize: evaluation.metrics.sampleSize,
        metadataJson: JSON.stringify({
          modelType: evaluation.modelType,
          version: evaluation.version,
        }),
        createdAt: input.trainedAt,
      });
      if (!insertBacktestResult.ok) {
        return insertBacktestResult;
      }

      for (const prediction of evaluation.predictions) {
        const insertPredictionResult = mlRepository.insertPrediction({
          modelId: modelResult.value,
          channelId: input.channelId,
          targetMetric: input.targetMetric,
          predictionDate: prediction.date,
          horizonDays: prediction.horizonDays,
          predictedValue: prediction.predicted,
          actualValue: null,
          p10: prediction.p10,
          p50: prediction.p50,
          p90: prediction.p90,
          generatedAt: input.trainedAt,
        });
        if (!insertPredictionResult.ok) {
          return insertPredictionResult;
        }
      }

      persisted.push({
        ...evaluation,
        modelId: modelResult.value,
      });
    }

    return ok(undefined);
  });

  if (!transactionResult.ok) {
    return err(
      createMlError(
        'ML_PERSIST_FAILED',
        'Nie udalo sie zapisac wynikow treningu ML.',
        {
          channelId: input.channelId,
          targetMetric: input.targetMetric,
          models: input.evaluations.length,
          causeErrorCode: transactionResult.error.code,
        },
        transactionResult.error,
      ),
    );
  }

  return ok(persisted);
}

export function runMlBaseline(input: RunMlBaselineInput): Result<MlRunBaselineResultDTO, AppError> {
  const targetMetric = input.targetMetric ?? 'views';
  const horizonDays = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const minHistoryDays = input.minHistoryDays ?? DEFAULT_MIN_HISTORY_DAYS;
  const now = input.now ?? (() => new Date());
  const trainedAt = now().toISOString();
  const qualityGate: QualityGateConfig = {
    ...DEFAULT_QUALITY_GATE,
    ...input.qualityGate,
  };

  if (!input.channelId) {
    return err(createMlError('ML_INVALID_INPUT', 'Brakuje channelId dla treningu ML.', {}));
  }

  if (!Number.isInteger(horizonDays) || horizonDays <= 0) {
    return err(
      createMlError(
        'ML_INVALID_INPUT',
        'Horyzont predykcji musi byc dodatnia liczba calkowita.',
        { horizonDays },
      ),
    );
  }

  const seriesResult = readSeries(input.db, input.channelId, targetMetric);
  if (!seriesResult.ok) {
    return seriesResult;
  }

  const series = seriesResult.value;
  if (series.length === 0) {
    return err(
      createMlError(
        'ML_SERIES_EMPTY',
        'Brak danych szeregu czasowego dla podanego kanalu.',
        { channelId: input.channelId, targetMetric },
      ),
    );
  }

  if (series.length < minHistoryDays) {
    return ok({
      channelId: input.channelId,
      targetMetric,
      status: 'insufficient_data',
      reason: `Za malo danych historycznych do treningu (wymagane min. ${String(minHistoryDays)} dni).`,
      activeModelType: null,
      trainedAt: null,
      predictionsGenerated: 0,
      models: [],
    });
  }

  const evaluations = evaluateModels(series, horizonDays, minHistoryDays, qualityGate);
  const persistResult = persistEvaluations({
    db: input.db,
    channelId: input.channelId,
    targetMetric,
    sourceSyncRunId: input.sourceSyncRunId ?? null,
    trainedAt,
    evaluations,
  });
  if (!persistResult.ok) {
    return persistResult;
  }

  const activeModel = persistResult.value.find((evaluation) => evaluation.status === 'active');
  const models: MlModelRunSummaryDTO[] = persistResult.value.map((evaluation) => ({
    modelId: evaluation.modelId,
    modelType: evaluation.modelType,
    status: evaluation.status,
    metrics: {
      mae: evaluation.metrics.mae,
      smape: evaluation.metrics.smape,
      mase: evaluation.metrics.mase,
      sampleSize: evaluation.metrics.sampleSize,
    },
  }));

  const predictionsGenerated = persistResult.value.reduce(
    (total, evaluation) => total + evaluation.predictions.length,
    0,
  );

  return ok({
    channelId: input.channelId,
    targetMetric,
    status: 'completed',
    reason: null,
    activeModelType: activeModel?.modelType ?? null,
    trainedAt,
    predictionsGenerated,
    models,
  });
}

export function getLatestMlForecast(input: GetMlForecastInput): Result<MlForecastResultDTO, AppError> {
  const targetMetric = input.targetMetric ?? 'views';
  const mlQueries = createMlQueries(input.db);

  try {
    const activeModelResult = mlQueries.getLatestActiveForecastModel({
      channelId: input.channelId,
      targetMetric,
    });
    if (!activeModelResult.ok) {
      return err(
        createMlError(
          'ML_FORECAST_READ_FAILED',
          'Nie udalo sie odczytac prognozy ML.',
          {
            channelId: input.channelId,
            targetMetric,
            causeErrorCode: activeModelResult.error.code,
          },
          activeModelResult.error,
        ),
      );
    }

    const activeModel = activeModelResult.value;

    if (!activeModel) {
      return ok({
        channelId: input.channelId,
        targetMetric,
        modelType: null,
        trainedAt: null,
        points: [],
      });
    }

    const predictionRowsResult = mlQueries.getForecastPredictionsByModel({ modelId: activeModel.modelId });
    if (!predictionRowsResult.ok) {
      return err(
        createMlError(
          'ML_FORECAST_READ_FAILED',
          'Nie udalo sie odczytac prognozy ML.',
          {
            channelId: input.channelId,
            targetMetric,
            modelId: activeModel.modelId,
            causeErrorCode: predictionRowsResult.error.code,
          },
          predictionRowsResult.error,
        ),
      );
    }

    const points = predictionRowsResult.value.map((row) => ({
      date: row.predictionDate,
      horizonDays: row.horizonDays,
      predicted: row.predictedValue,
      p10: row.p10,
      p50: row.p50,
      p90: row.p90,
    }));

    return ok({
      channelId: input.channelId,
      targetMetric,
      modelType: activeModel.modelType,
      trainedAt: activeModel.trainedAt,
      points,
    });
  } catch (cause) {
    return err(
      createMlError(
        'ML_FORECAST_READ_FAILED',
        'Nie udalo sie odczytac prognozy ML.',
        { channelId: input.channelId, targetMetric },
        cause,
      ),
    );
  }
}
