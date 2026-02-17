import type { MigrationDefinition } from './types.ts';

export const planningSystemSchemaMigration: MigrationDefinition = {
  id: 12,
  name: '012-planning-system-schema',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS planning_plans (
        plan_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        date_from TEXT NOT NULL,
        date_to TEXT NOT NULL,
        algorithm_version TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        recommendations_count INTEGER NOT NULL DEFAULT 0 CHECK (recommendations_count >= 0),
        CHECK (date(date_from) <= date(date_to))
      );

      CREATE TABLE IF NOT EXISTS planning_recommendations (
        recommendation_id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES planning_plans(plan_id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        slot_date TEXT NOT NULL,
        slot_order INTEGER NOT NULL CHECK (slot_order > 0),
        topic_cluster_id TEXT NOT NULL,
        topic_label TEXT NOT NULL,
        suggested_title TEXT NOT NULL,
        priority_score REAL NOT NULL CHECK (priority_score BETWEEN 0 AND 100),
        confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
        rationale TEXT NOT NULL,
        evidence_json TEXT NOT NULL DEFAULT '[]',
        warnings_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        CHECK (date(slot_date) IS NOT NULL)
      );

      CREATE INDEX IF NOT EXISTS idx_planning_plans_channel_range_generated
        ON planning_plans(channel_id, date_from, date_to, generated_at DESC, plan_id ASC);

      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_plan_order
        ON planning_recommendations(plan_id, slot_order ASC, slot_date ASC);

      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_channel_slot_date
        ON planning_recommendations(channel_id, slot_date ASC, topic_cluster_id ASC);
    `);
  },
};
