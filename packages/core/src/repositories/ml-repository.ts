import type Database from 'better-sqlite3';
import {
  AppError,
  ok,
  err,
  type MlAnomalyConfidence,
  type MlAnomalyMethod,
  type MlAnomalySeverity,
  type MlModelStatus,
  type MlTargetMetric,
  type Result,
} from '@moze/shared';

type MlModelType = 'holt-winters' | 'linear-regression';

export interface MlRepository {
  clearActiveModels: (input: { channelId: string; targetMetric: MlTargetMetric }) => Result<void, AppError>;
  insertModel: (input: {
    channelId: string;
    targetMetric: MlTargetMetric;
    modelType: MlModelType;
    version: string;
    status: MlModelStatus;
    isActive: number;
    configJson: string;
    metricsJson: string;
    sourceSyncRunId: number | null;
    trainedAt: string;
  }) => Result<number, AppError>;
  insertBacktest: (input: {
    modelId: number;
    channelId: string;
    targetMetric: MlTargetMetric;
    mae: number;
    smape: number;
    mase: number;
    sampleSize: number;
    metadataJson: string;
    createdAt: string;
  }) => Result<void, AppError>;
  insertPrediction: (input: {
    modelId: number;
    channelId: string;
    targetMetric: MlTargetMetric;
    predictionDate: string;
    horizonDays: number;
    predictedValue: number;
    actualValue: number | null;
    p10: number;
    p50: number;
    p90: number;
    generatedAt: string;
  }) => Result<void, AppError>;
  deleteAnomalies: (input: {
    channelId: string;
    targetMetric: MlTargetMetric;
    dateFrom: string | null;
    dateTo: string | null;
  }) => Result<void, AppError>;
  insertAnomaly: (input: {
    channelId: string;
    targetMetric: MlTargetMetric;
    date: string;
    metricValue: number;
    baselineValue: number;
    deviationRatio: number;
    zScore: number | null;
    iqrLower: number;
    iqrUpper: number;
    method: MlAnomalyMethod;
    confidence: MlAnomalyConfidence;
    severity: MlAnomalySeverity;
    explanation: string;
    sourceSyncRunId: number | null;
    detectedAt: string;
  }) => Result<void, AppError>;
  runInTransaction: <T>(operation: () => Result<T, AppError>) => Result<T, AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function toNumberId(value: number | bigint): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return value;
}

export function createMlRepository(db: Database.Database): MlRepository {
  const clearActiveStmt = db.prepare<{ channelId: string; targetMetric: MlTargetMetric }>(
    `
      UPDATE ml_models
      SET
        is_active = 0,
        status = CASE WHEN status = 'active' THEN 'shadow' ELSE status END
      WHERE channel_id = @channelId
        AND target_metric = @targetMetric
        AND is_active = 1
    `,
  );

  const insertModelStmt = db.prepare<{
    channelId: string;
    targetMetric: MlTargetMetric;
    modelType: MlModelType;
    version: string;
    status: MlModelStatus;
    isActive: number;
    configJson: string;
    metricsJson: string;
    sourceSyncRunId: number | null;
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
        @targetMetric,
        @modelType,
        @version,
        @status,
        @isActive,
        @configJson,
        @metricsJson,
        @sourceSyncRunId,
        @trainedAt
      )
    `,
  );

  const insertBacktestStmt = db.prepare<{
    modelId: number;
    channelId: string;
    targetMetric: MlTargetMetric;
    mae: number;
    smape: number;
    mase: number;
    sampleSize: number;
    metadataJson: string;
    createdAt: string;
  }>(
    `
      INSERT INTO ml_backtests (
        model_id,
        channel_id,
        target_metric,
        mae,
        smape,
        mase,
        sample_size,
        metadata_json,
        created_at
      )
      VALUES (
        @modelId,
        @channelId,
        @targetMetric,
        @mae,
        @smape,
        @mase,
        @sampleSize,
        @metadataJson,
        @createdAt
      )
    `,
  );

  const insertPredictionStmt = db.prepare<{
    modelId: number;
    channelId: string;
    targetMetric: MlTargetMetric;
    predictionDate: string;
    horizonDays: number;
    predictedValue: number;
    actualValue: number | null;
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
        @targetMetric,
        @predictionDate,
        @horizonDays,
        @predictedValue,
        @actualValue,
        @p10,
        @p50,
        @p90,
        @generatedAt
      )
    `,
  );

  const deleteAnomaliesStmt = db.prepare<{
    channelId: string;
    targetMetric: MlTargetMetric;
    dateFrom: string | null;
    dateTo: string | null;
  }>(
    `
      DELETE FROM ml_anomalies
      WHERE channel_id = @channelId
        AND target_metric = @targetMetric
        AND (@dateFrom IS NULL OR date >= @dateFrom)
        AND (@dateTo IS NULL OR date <= @dateTo)
    `,
  );

  const insertAnomalyStmt = db.prepare<{
    channelId: string;
    targetMetric: MlTargetMetric;
    date: string;
    metricValue: number;
    baselineValue: number;
    deviationRatio: number;
    zScore: number | null;
    iqrLower: number;
    iqrUpper: number;
    method: MlAnomalyMethod;
    confidence: MlAnomalyConfidence;
    severity: MlAnomalySeverity;
    explanation: string;
    sourceSyncRunId: number | null;
    detectedAt: string;
  }>(
    `
      INSERT INTO ml_anomalies (
        channel_id,
        target_metric,
        date,
        metric_value,
        baseline_value,
        deviation_ratio,
        z_score,
        iqr_lower,
        iqr_upper,
        method,
        confidence,
        severity,
        explanation,
        source_sync_run_id,
        detected_at
      )
      VALUES (
        @channelId,
        @targetMetric,
        @date,
        @metricValue,
        @baselineValue,
        @deviationRatio,
        @zScore,
        @iqrLower,
        @iqrUpper,
        @method,
        @confidence,
        @severity,
        @explanation,
        @sourceSyncRunId,
        @detectedAt
      )
    `,
  );

  return {
    clearActiveModels: (input) => {
      try {
        clearActiveStmt.run({
          channelId: input.channelId,
          targetMetric: input.targetMetric,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ML_CLEAR_ACTIVE_FAILED',
            'Nie udalo sie wyczyscic aktywnych modeli ML.',
            'error',
            { channelId: input.channelId, targetMetric: input.targetMetric },
            toError(cause),
          ),
        );
      }
    },

    insertModel: (input) => {
      try {
        const result = insertModelStmt.run({
          channelId: input.channelId,
          targetMetric: input.targetMetric,
          modelType: input.modelType,
          version: input.version,
          status: input.status,
          isActive: input.isActive,
          configJson: input.configJson,
          metricsJson: input.metricsJson,
          sourceSyncRunId: input.sourceSyncRunId,
          trainedAt: input.trainedAt,
        });
        return ok(toNumberId(result.lastInsertRowid));
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ML_MODEL_INSERT_FAILED',
            'Nie udalo sie zapisac modelu ML.',
            'error',
            { channelId: input.channelId, targetMetric: input.targetMetric, modelType: input.modelType },
            toError(cause),
          ),
        );
      }
    },

    insertBacktest: (input) => {
      try {
        insertBacktestStmt.run({
          modelId: input.modelId,
          channelId: input.channelId,
          targetMetric: input.targetMetric,
          mae: input.mae,
          smape: input.smape,
          mase: input.mase,
          sampleSize: input.sampleSize,
          metadataJson: input.metadataJson,
          createdAt: input.createdAt,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ML_BACKTEST_INSERT_FAILED',
            'Nie udalo sie zapisac backtestu ML.',
            'error',
            { modelId: input.modelId, channelId: input.channelId, targetMetric: input.targetMetric },
            toError(cause),
          ),
        );
      }
    },

    insertPrediction: (input) => {
      try {
        insertPredictionStmt.run({
          modelId: input.modelId,
          channelId: input.channelId,
          targetMetric: input.targetMetric,
          predictionDate: input.predictionDate,
          horizonDays: input.horizonDays,
          predictedValue: input.predictedValue,
          actualValue: input.actualValue,
          p10: input.p10,
          p50: input.p50,
          p90: input.p90,
          generatedAt: input.generatedAt,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ML_PREDICTION_INSERT_FAILED',
            'Nie udalo sie zapisac predykcji ML.',
            'error',
            {
              modelId: input.modelId,
              channelId: input.channelId,
              targetMetric: input.targetMetric,
              predictionDate: input.predictionDate,
            },
            toError(cause),
          ),
        );
      }
    },

    deleteAnomalies: (input) => {
      try {
        deleteAnomaliesStmt.run({
          channelId: input.channelId,
          targetMetric: input.targetMetric,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ML_ANOMALY_DELETE_FAILED',
            'Nie udalo sie usunac anomalii ML.',
            'error',
            {
              channelId: input.channelId,
              targetMetric: input.targetMetric,
              dateFrom: input.dateFrom,
              dateTo: input.dateTo,
            },
            toError(cause),
          ),
        );
      }
    },

    insertAnomaly: (input) => {
      try {
        insertAnomalyStmt.run({
          channelId: input.channelId,
          targetMetric: input.targetMetric,
          date: input.date,
          metricValue: input.metricValue,
          baselineValue: input.baselineValue,
          deviationRatio: input.deviationRatio,
          zScore: input.zScore,
          iqrLower: input.iqrLower,
          iqrUpper: input.iqrUpper,
          method: input.method,
          confidence: input.confidence,
          severity: input.severity,
          explanation: input.explanation,
          sourceSyncRunId: input.sourceSyncRunId,
          detectedAt: input.detectedAt,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ML_ANOMALY_INSERT_FAILED',
            'Nie udalo sie zapisac anomalii ML.',
            'error',
            {
              channelId: input.channelId,
              targetMetric: input.targetMetric,
              date: input.date,
            },
            toError(cause),
          ),
        );
      }
    },

    runInTransaction: <T>(operation: () => Result<T, AppError>) => {
      const transactionErrorRef: { current: AppError | null } = { current: null };
      try {
        const transaction = db.transaction(() => {
          const result = operation();
          if (!result.ok) {
            transactionErrorRef.current = result.error;
            throw new Error(result.error.message);
          }
          return result.value;
        });
        return ok(transaction());
      } catch (cause) {
        if (transactionErrorRef.current !== null) {
          return err(transactionErrorRef.current);
        }
        return err(
          AppError.create(
            'DB_ML_TRANSACTION_FAILED',
            'Nie udalo sie wykonac transakcji ML.',
            'error',
            {},
            toError(cause),
          ),
        );
      }
    },
  };
}
