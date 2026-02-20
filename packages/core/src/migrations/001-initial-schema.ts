import type { MigrationDefinition } from './types.ts';

export const initialSchemaMigration: MigrationDefinition = {
  id: 1,
  name: '001-initial-schema',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id TEXT REFERENCES profiles(id),
        status TEXT NOT NULL,
        stage TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS raw_api_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        request_params_json TEXT,
        response_body_json TEXT NOT NULL,
        http_status INTEGER NOT NULL,
        fetched_at TEXT NOT NULL,
        sync_run_id INTEGER REFERENCES sync_runs(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS dim_channel (
        channel_id TEXT PRIMARY KEY,
        profile_id TEXT REFERENCES profiles(id),
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        thumbnail_url TEXT,
        published_at TEXT NOT NULL,
        subscriber_count INTEGER NOT NULL DEFAULT 0,
        video_count INTEGER NOT NULL DEFAULT 0,
        view_count INTEGER NOT NULL DEFAULT 0,
        last_sync_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dim_video (
        video_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        published_at TEXT NOT NULL,
        duration_seconds INTEGER,
        view_count INTEGER NOT NULL DEFAULT 0,
        like_count INTEGER NOT NULL DEFAULT 0,
        comment_count INTEGER NOT NULL DEFAULT 0,
        thumbnail_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fact_channel_day (
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        subscribers INTEGER NOT NULL,
        views INTEGER NOT NULL,
        videos INTEGER NOT NULL,
        likes INTEGER NOT NULL DEFAULT 0,
        comments INTEGER NOT NULL DEFAULT 0,
        watch_time_minutes INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (channel_id, date)
      );

      CREATE TABLE IF NOT EXISTS fact_video_day (
        video_id TEXT NOT NULL REFERENCES dim_video(video_id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        views INTEGER NOT NULL,
        likes INTEGER NOT NULL,
        comments INTEGER NOT NULL,
        watch_time_minutes INTEGER,
        impressions INTEGER,
        ctr REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (video_id, date)
      );

      CREATE INDEX IF NOT EXISTS idx_sync_runs_profile_started
        ON sync_runs(profile_id, started_at);

      CREATE INDEX IF NOT EXISTS idx_raw_api_responses_source_fetched
        ON raw_api_responses(source, fetched_at);

      CREATE INDEX IF NOT EXISTS idx_raw_api_responses_sync_run
        ON raw_api_responses(sync_run_id);

      CREATE INDEX IF NOT EXISTS idx_dim_video_channel_published
        ON dim_video(channel_id, published_at);

      CREATE INDEX IF NOT EXISTS idx_fact_channel_day_channel_date
        ON fact_channel_day(channel_id, date);

      CREATE INDEX IF NOT EXISTS idx_fact_video_day_channel_date
        ON fact_video_day(channel_id, date);
    `);
  },
};
