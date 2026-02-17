import type Database from 'better-sqlite3';
import {
  AppError,
  ok,
  err,
  type MlAnomalyListResultDTO,
  type MlAnomalySeverity,
  type MlTargetMetric,
  type Result,
} from '@moze/shared';

export interface MlSeriesPointRow {
  date: string;
  value: number;
}

export interface MlActiveForecastModelRow {
  modelId: number;
  modelType: 'holt-winters' | 'linear-regression';
  trainedAt: string;
}

export interface MlForecastPredictionRow {
  predictionDate: string;
  horizonDays: number;
  predictedValue: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface MlQueries {
  getMetricSeries: (input: {
    channelId: string;
    targetMetric: MlTargetMetric;
  }) => Result<MlSeriesPointRow[], AppError>;
  getDaysSinceLastVideoByDate: (input: { channelId: string }) => Result<Map<string, number | null>, AppError>;
  getLatestActiveForecastModel: (input: {
    channelId: string;
    targetMetric: MlTargetMetric;
  }) => Result<MlActiveForecastModelRow | null, AppError>;
  getForecastPredictionsByModel: (input: { modelId: number }) => Result<MlForecastPredictionRow[], AppError>;
  getPersistedAnomalies: (input: {
    channelId: string;
    targetMetric: MlTargetMetric;
    dateFrom: string;
    dateTo: string;
    severities?: readonly MlAnomalySeverity[];
  }) => Result<MlAnomalyListResultDTO['items'], AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

export function createMlQueries(db: Database.Database): MlQueries {
  const getViewsSeriesStmt = db.prepare<{ channelId: string }, MlSeriesPointRow>(
    `
      SELECT
        date,
        views AS value
      FROM fact_channel_day
      WHERE channel_id = @channelId
      ORDER BY date ASC
    `,
  );

  const getSubscribersSeriesStmt = db.prepare<{ channelId: string }, MlSeriesPointRow>(
    `
      SELECT
        date,
        subscribers AS value
      FROM fact_channel_day
      WHERE channel_id = @channelId
      ORDER BY date ASC
    `,
  );

  const getDaysSinceLastVideoStmt = db.prepare<{ channelId: string }, { date: string; daysSinceLastVideo: number | null }>(
    `
      SELECT
        date,
        days_since_last_video AS daysSinceLastVideo
      FROM ml_features
      WHERE channel_id = @channelId
      ORDER BY date ASC, feature_set_version ASC
    `,
  );

  const getLatestActiveModelStmt = db.prepare<
    { channelId: string; targetMetric: MlTargetMetric },
    MlActiveForecastModelRow
  >(
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

  const getForecastPredictionsStmt = db.prepare<{ modelId: number }, MlForecastPredictionRow>(
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

  return {
    getMetricSeries: (input) => {
      try {
        const statement = input.targetMetric === 'subscribers' ? getSubscribersSeriesStmt : getViewsSeriesStmt;
        return ok(statement.all({ channelId: input.channelId }));
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ML_SERIES_READ_FAILED',
            'Nie udalo sie odczytac szeregu czasowego ML.',
            'error',
            { channelId: input.channelId, targetMetric: input.targetMetric },
            toError(cause),
          ),
        );
      }
    },

    getDaysSinceLastVideoByDate: (input) => {
      try {
        const rows = getDaysSinceLastVideoStmt.all({ channelId: input.channelId });
        const map = new Map<string, number | null>();
        for (const row of rows) {
          map.set(row.date, row.daysSinceLastVideo);
        }
        return ok(map);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ML_FEATURES_READ_FAILED',
            'Nie udalo sie odczytac cech ML.',
            'error',
            { channelId: input.channelId },
            toError(cause),
          ),
        );
      }
    },

    getLatestActiveForecastModel: (input) => {
      try {
        return ok(
          getLatestActiveModelStmt.get({
            channelId: input.channelId,
            targetMetric: input.targetMetric,
          }) ?? null,
        );
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ML_ACTIVE_MODEL_READ_FAILED',
            'Nie udalo sie odczytac aktywnego modelu ML.',
            'error',
            { channelId: input.channelId, targetMetric: input.targetMetric },
            toError(cause),
          ),
        );
      }
    },

    getForecastPredictionsByModel: (input) => {
      try {
        return ok(getForecastPredictionsStmt.all({ modelId: input.modelId }));
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ML_PREDICTIONS_READ_FAILED',
            'Nie udalo sie odczytac predykcji ML.',
            'error',
            { modelId: input.modelId },
            toError(cause),
          ),
        );
      }
    },

    getPersistedAnomalies: (input) => {
      try {
        const params: Record<string, unknown> = {
          channelId: input.channelId,
          targetMetric: input.targetMetric,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        };

        let severityFilterSql = '';
        if (input.severities && input.severities.length > 0) {
          const placeholders: string[] = [];
          for (let index = 0; index < input.severities.length; index += 1) {
            const key = `severity${String(index)}`;
            placeholders.push(`@${key}`);
            params[key] = input.severities[index];
          }
          severityFilterSql = `AND severity IN (${placeholders.join(', ')})`;
        }

        const sql = `
          SELECT
            id,
            channel_id AS channelId,
            target_metric AS targetMetric,
            date,
            metric_value AS value,
            baseline_value AS baseline,
            deviation_ratio AS deviationRatio,
            z_score AS zScore,
            method,
            confidence,
            severity,
            explanation,
            detected_at AS detectedAt
          FROM ml_anomalies
          WHERE channel_id = @channelId
            AND target_metric = @targetMetric
            AND date BETWEEN @dateFrom AND @dateTo
            ${severityFilterSql}
          ORDER BY date DESC, id DESC
        `;

        const rows = db
          .prepare<Record<string, unknown>, MlAnomalyListResultDTO['items'][number]>(sql)
          .all(params);
        return ok(rows);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ML_ANOMALIES_READ_FAILED',
            'Nie udalo sie odczytac anomalii ML.',
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
  };
}
