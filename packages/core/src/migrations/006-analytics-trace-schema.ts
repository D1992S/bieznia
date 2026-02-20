import type { MigrationDefinition } from './types.ts';

export const analyticsTraceSchemaMigration: MigrationDefinition = {
  id: 6,
  name: '006-analytics-trace-schema',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS analytics_trace_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trace_id TEXT NOT NULL UNIQUE,
        operation_name TEXT NOT NULL,
        params_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
        row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
        duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
        error_code TEXT,
        error_message TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_analytics_trace_runs_operation_time
        ON analytics_trace_runs(operation_name, started_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS analytics_trace_lineage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trace_id TEXT NOT NULL REFERENCES analytics_trace_runs(trace_id) ON DELETE CASCADE,
        source_table TEXT NOT NULL,
        primary_keys_json TEXT NOT NULL,
        date_from TEXT,
        date_to TEXT,
        filters_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_analytics_trace_lineage_trace
        ON analytics_trace_lineage(trace_id, id ASC);

      CREATE INDEX IF NOT EXISTS idx_analytics_trace_lineage_table_time
        ON analytics_trace_lineage(source_table, created_at DESC, id DESC);
    `);
  },
};
