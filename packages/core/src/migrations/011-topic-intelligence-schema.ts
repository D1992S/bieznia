import type { MigrationDefinition } from './types.ts';

export const topicIntelligenceSchemaMigration: MigrationDefinition = {
  id: 11,
  name: '011-topic-intelligence-schema',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dim_topic_cluster (
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        cluster_id TEXT NOT NULL,
        label TEXT NOT NULL,
        keywords_json TEXT NOT NULL DEFAULT '[]',
        sample_size INTEGER NOT NULL DEFAULT 0 CHECK (sample_size >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (channel_id, cluster_id)
      );

      CREATE TABLE IF NOT EXISTS fact_topic_pressure_day (
        channel_id TEXT NOT NULL,
        cluster_id TEXT NOT NULL,
        date TEXT NOT NULL,
        owner_views INTEGER NOT NULL CHECK (owner_views >= 0),
        competitor_views INTEGER NOT NULL CHECK (competitor_views >= 0),
        pressure_score REAL NOT NULL CHECK (pressure_score >= 0),
        trend_direction TEXT NOT NULL CHECK (trend_direction IN ('rising', 'stable', 'declining')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (channel_id, cluster_id, date),
        FOREIGN KEY (channel_id, cluster_id)
          REFERENCES dim_topic_cluster(channel_id, cluster_id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS agg_topic_gaps (
        channel_id TEXT NOT NULL,
        cluster_id TEXT NOT NULL,
        date_from TEXT NOT NULL,
        date_to TEXT NOT NULL,
        owner_coverage REAL NOT NULL CHECK (owner_coverage BETWEEN 0 AND 1),
        niche_pressure REAL NOT NULL CHECK (niche_pressure >= 0),
        gap_score REAL NOT NULL CHECK (gap_score >= 0),
        cannibalization_risk REAL NOT NULL CHECK (cannibalization_risk BETWEEN 0 AND 1),
        trend_direction TEXT NOT NULL CHECK (trend_direction IN ('rising', 'stable', 'declining')),
        confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
        rationale TEXT NOT NULL,
        calculated_at TEXT NOT NULL,
        CHECK (date(date_from) <= date(date_to)),
        PRIMARY KEY (channel_id, cluster_id, date_from, date_to),
        FOREIGN KEY (channel_id, cluster_id)
          REFERENCES dim_topic_cluster(channel_id, cluster_id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_dim_topic_cluster_channel_label
        ON dim_topic_cluster(channel_id, label ASC, cluster_id ASC);

      CREATE INDEX IF NOT EXISTS idx_fact_topic_pressure_day_channel_date
        ON fact_topic_pressure_day(channel_id, date ASC, cluster_id ASC);

      CREATE INDEX IF NOT EXISTS idx_fact_topic_pressure_day_cluster_date
        ON fact_topic_pressure_day(channel_id, cluster_id, date ASC);

      CREATE INDEX IF NOT EXISTS idx_agg_topic_gaps_channel_range
        ON agg_topic_gaps(channel_id, date_from, date_to, gap_score DESC, cluster_id ASC);
    `);
  },
};
