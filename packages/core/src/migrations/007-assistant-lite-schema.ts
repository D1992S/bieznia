import type { MigrationDefinition } from './types.ts';

export const assistantLiteSchemaMigration: MigrationDefinition = {
  id: 7,
  name: '007-assistant-lite-schema',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS assistant_threads (
        thread_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_assistant_threads_channel_updated
        ON assistant_threads(channel_id, updated_at DESC, thread_id ASC);

      CREATE TABLE IF NOT EXISTS assistant_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL REFERENCES assistant_threads(thread_id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        text TEXT NOT NULL,
        confidence TEXT CHECK (confidence IN ('low', 'medium', 'high')),
        follow_up_questions_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_assistant_messages_thread_order
        ON assistant_messages(thread_id, id ASC);

      CREATE TABLE IF NOT EXISTS assistant_message_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL REFERENCES assistant_messages(id) ON DELETE CASCADE,
        evidence_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        label TEXT NOT NULL,
        value TEXT NOT NULL,
        source_table TEXT NOT NULL,
        source_record_id TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_assistant_message_evidence_message
        ON assistant_message_evidence(message_id, id ASC);

      CREATE INDEX IF NOT EXISTS idx_assistant_message_evidence_source
        ON assistant_message_evidence(source_table, source_record_id, id ASC);
    `);
  },
};
