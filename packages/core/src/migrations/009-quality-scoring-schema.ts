import type { MigrationDefinition } from './types.ts';

export const qualityScoringSchemaMigration: MigrationDefinition = {
  id: 9,
  name: '009-quality-scoring-schema',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agg_quality_scores (
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        video_id TEXT NOT NULL REFERENCES dim_video(video_id) ON DELETE CASCADE,
        date_from TEXT NOT NULL,
        date_to TEXT NOT NULL,
        score REAL NOT NULL CHECK (score BETWEEN 0 AND 100),
        velocity_score REAL NOT NULL CHECK (velocity_score BETWEEN 0 AND 1),
        efficiency_score REAL NOT NULL CHECK (efficiency_score BETWEEN 0 AND 1),
        engagement_score REAL NOT NULL CHECK (engagement_score BETWEEN 0 AND 1),
        retention_score REAL NOT NULL CHECK (retention_score BETWEEN 0 AND 1),
        consistency_score REAL NOT NULL CHECK (consistency_score BETWEEN 0 AND 1),
        confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
        active_days INTEGER NOT NULL,
        components_json TEXT NOT NULL DEFAULT '{}',
        calculated_at TEXT NOT NULL,
        CHECK (date(date_from) <= date(date_to)),
        PRIMARY KEY (channel_id, video_id, date_from, date_to)
      );

      CREATE INDEX IF NOT EXISTS idx_agg_quality_scores_channel_range
        ON agg_quality_scores(channel_id, date_from, date_to, score DESC, video_id ASC);

      CREATE INDEX IF NOT EXISTS idx_agg_quality_scores_video_calculated
        ON agg_quality_scores(video_id, calculated_at DESC);
    `);
  },
};
