import type { MigrationDefinition } from './types.ts';

export const competitorIntelligenceSchemaMigration: MigrationDefinition = {
  id: 10,
  name: '010-competitor-intelligence-schema',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dim_competitor (
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        competitor_channel_id TEXT NOT NULL,
        name TEXT NOT NULL,
        handle TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (channel_id, competitor_channel_id)
      );

      CREATE TABLE IF NOT EXISTS fact_competitor_day (
        channel_id TEXT NOT NULL,
        competitor_channel_id TEXT NOT NULL,
        date TEXT NOT NULL,
        subscribers INTEGER NOT NULL CHECK (subscribers >= 0),
        views INTEGER NOT NULL CHECK (views >= 0),
        videos INTEGER NOT NULL CHECK (videos >= 0),
        subscribers_delta INTEGER NOT NULL,
        views_delta INTEGER NOT NULL,
        videos_delta INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (date(date) IS NOT NULL),
        PRIMARY KEY (channel_id, competitor_channel_id, date),
        FOREIGN KEY (channel_id, competitor_channel_id)
          REFERENCES dim_competitor(channel_id, competitor_channel_id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_dim_competitor_channel_name
        ON dim_competitor(channel_id, name ASC, competitor_channel_id ASC);

      CREATE INDEX IF NOT EXISTS idx_fact_competitor_day_channel_date
        ON fact_competitor_day(channel_id, date ASC, competitor_channel_id ASC);

      CREATE INDEX IF NOT EXISTS idx_fact_competitor_day_competitor_date
        ON fact_competitor_day(channel_id, competitor_channel_id, date ASC);
    `);
  },
};
