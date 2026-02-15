import type { MigrationDefinition } from './types.ts';

export const mlAnomalyTrendSchemaMigration: MigrationDefinition = {
  id: 5,
  name: '005-ml-anomaly-trend-schema',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ml_anomalies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        target_metric TEXT NOT NULL,
        date TEXT NOT NULL,
        metric_value REAL NOT NULL CHECK (metric_value >= 0),
        baseline_value REAL NOT NULL CHECK (baseline_value >= 0),
        deviation_ratio REAL NOT NULL,
        z_score REAL,
        iqr_lower REAL,
        iqr_upper REAL,
        method TEXT NOT NULL CHECK (method IN ('zscore', 'iqr', 'consensus')),
        confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
        severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
        explanation TEXT NOT NULL,
        source_sync_run_id INTEGER REFERENCES sync_runs(id),
        detected_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_ml_anomalies_unique
        ON ml_anomalies(channel_id, target_metric, date, method);

      CREATE INDEX IF NOT EXISTS idx_ml_anomalies_channel_date
        ON ml_anomalies(channel_id, target_metric, date DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_ml_anomalies_severity
        ON ml_anomalies(channel_id, target_metric, severity, date DESC, id DESC);
    `);
  },
};
