import type { MigrationDefinition } from './types.ts';

export const analyticsQueryCacheSchemaMigration: MigrationDefinition = {
  id: 8,
  name: '008-analytics-query-cache-schema',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS analytics_query_cache (
        metric_id TEXT NOT NULL,
        params_hash TEXT NOT NULL,
        revision INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (metric_id, params_hash)
      );

      CREATE INDEX IF NOT EXISTS idx_analytics_query_cache_expires
        ON analytics_query_cache(expires_at ASC, metric_id ASC);

      CREATE TABLE IF NOT EXISTS analytics_cache_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_id TEXT NOT NULL,
        params_hash TEXT NOT NULL,
        revision INTEGER NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('hit', 'miss', 'set', 'invalidate', 'stale')),
        duration_ms INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_analytics_cache_events_created
        ON analytics_cache_events(created_at DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_analytics_cache_events_metric_created
        ON analytics_cache_events(metric_id ASC, created_at DESC, id DESC);
    `);
  },
};
