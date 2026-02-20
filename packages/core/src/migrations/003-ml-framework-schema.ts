import type { MigrationDefinition } from './types.ts';

export const mlFrameworkSchemaMigration: MigrationDefinition = {
  id: 3,
  name: '003-ml-framework-schema',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ml_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        target_metric TEXT NOT NULL,
        model_type TEXT NOT NULL,
        version TEXT NOT NULL,
        status TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        config_json TEXT NOT NULL,
        metrics_json TEXT,
        source_sync_run_id INTEGER REFERENCES sync_runs(id),
        trained_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ml_backtests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id INTEGER NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        target_metric TEXT NOT NULL,
        mae REAL NOT NULL,
        smape REAL NOT NULL,
        mase REAL NOT NULL,
        sample_size INTEGER NOT NULL CHECK (sample_size >= 0),
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ml_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id INTEGER NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        target_metric TEXT NOT NULL,
        prediction_date TEXT NOT NULL,
        horizon_days INTEGER NOT NULL CHECK (horizon_days > 0),
        predicted_value REAL NOT NULL CHECK (predicted_value >= 0),
        actual_value REAL,
        p10 REAL NOT NULL CHECK (p10 >= 0),
        p50 REAL NOT NULL CHECK (p50 >= 0),
        p90 REAL NOT NULL CHECK (p90 >= 0),
        generated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ml_models_channel_target_time
        ON ml_models(channel_id, target_metric, trained_at, id);

      CREATE INDEX IF NOT EXISTS idx_ml_models_active
        ON ml_models(channel_id, target_metric, is_active, trained_at, id);

      CREATE INDEX IF NOT EXISTS idx_ml_backtests_model_time
        ON ml_backtests(model_id, created_at, id);

      CREATE INDEX IF NOT EXISTS idx_ml_predictions_channel_target_date
        ON ml_predictions(channel_id, target_metric, prediction_date, generated_at, id);
    `);
  },
};
