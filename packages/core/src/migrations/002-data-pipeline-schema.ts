import type { MigrationDefinition } from './types.ts';

export const dataPipelineSchemaMigration: MigrationDefinition = {
  id: 2,
  name: '002-data-pipeline-schema',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS stg_channels (
        channel_id TEXT PRIMARY KEY REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        thumbnail_url TEXT,
        published_at TEXT NOT NULL,
        subscriber_count INTEGER NOT NULL DEFAULT 0 CHECK (subscriber_count >= 0),
        video_count INTEGER NOT NULL DEFAULT 0 CHECK (video_count >= 0),
        view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
        last_sync_at TEXT,
        ingested_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stg_videos (
        video_id TEXT PRIMARY KEY REFERENCES dim_video(video_id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        published_at TEXT NOT NULL,
        duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
        view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
        like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
        comment_count INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
        thumbnail_url TEXT,
        ingested_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ml_features (
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        feature_set_version TEXT NOT NULL,
        views_7d INTEGER NOT NULL CHECK (views_7d >= 0),
        views_30d INTEGER NOT NULL CHECK (views_30d >= 0),
        subscriber_delta_7d INTEGER NOT NULL,
        engagement_rate_7d REAL NOT NULL CHECK (engagement_rate_7d >= 0),
        publish_frequency_30d REAL NOT NULL CHECK (publish_frequency_30d >= 0),
        days_since_last_video INTEGER CHECK (days_since_last_video IS NULL OR days_since_last_video >= 0),
        source_sync_run_id INTEGER REFERENCES sync_runs(id),
        generated_at TEXT NOT NULL,
        PRIMARY KEY (channel_id, date, feature_set_version)
      );

      CREATE TABLE IF NOT EXISTS data_lineage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pipeline_stage TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        source_table TEXT NOT NULL,
        source_record_count INTEGER NOT NULL DEFAULT 0 CHECK (source_record_count >= 0),
        metadata_json TEXT NOT NULL,
        source_sync_run_id INTEGER REFERENCES sync_runs(id),
        produced_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_stg_videos_channel_published
        ON stg_videos(channel_id, published_at);

      CREATE INDEX IF NOT EXISTS idx_ml_features_channel_date
        ON ml_features(channel_id, date, feature_set_version);

      CREATE INDEX IF NOT EXISTS idx_data_lineage_entity_time
        ON data_lineage(entity_type, entity_key, produced_at);

      CREATE INDEX IF NOT EXISTS idx_data_lineage_stage_time
        ON data_lineage(pipeline_stage, produced_at);
    `);
  },
};
