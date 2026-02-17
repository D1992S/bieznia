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
        score REAL NOT NULL,
        velocity_score REAL NOT NULL,
        efficiency_score REAL NOT NULL,
        engagement_score REAL NOT NULL,
        retention_score REAL NOT NULL,
        consistency_score REAL NOT NULL,
        confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
        active_days INTEGER NOT NULL,
        components_json TEXT NOT NULL DEFAULT '{}',
        calculated_at TEXT NOT NULL,
        PRIMARY KEY (channel_id, video_id, date_from, date_to)
      );

      CREATE INDEX IF NOT EXISTS idx_agg_quality_scores_channel_range
        ON agg_quality_scores(channel_id, date_from, date_to, score DESC, video_id ASC);

      CREATE INDEX IF NOT EXISTS idx_agg_quality_scores_video_calculated
        ON agg_quality_scores(video_id, calculated_at DESC);
    `);
  },
};
