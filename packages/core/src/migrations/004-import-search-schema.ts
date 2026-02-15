import type { MigrationDefinition } from './types.ts';

export const importSearchSchemaMigration: MigrationDefinition = {
  id: 4,
  name: '004-import-search-schema',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS raw_csv_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id TEXT REFERENCES profiles(id),
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        source_name TEXT NOT NULL,
        csv_sha256 TEXT NOT NULL,
        column_mapping_json TEXT NOT NULL,
        rows_total INTEGER NOT NULL CHECK (rows_total >= 0),
        rows_valid INTEGER NOT NULL CHECK (rows_valid >= 0),
        rows_invalid INTEGER NOT NULL CHECK (rows_invalid >= 0),
        status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
        error_json TEXT,
        imported_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_raw_csv_imports_channel_time
        ON raw_csv_imports(channel_id, imported_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS dim_content_documents (
        document_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES dim_channel(channel_id) ON DELETE CASCADE,
        video_id TEXT REFERENCES dim_video(video_id) ON DELETE SET NULL,
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        transcript TEXT NOT NULL DEFAULT '',
        published_at TEXT,
        source_import_id INTEGER REFERENCES raw_csv_imports(id) ON DELETE SET NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_dim_content_documents_channel_time
        ON dim_content_documents(channel_id, published_at, document_id);

      CREATE INDEX IF NOT EXISTS idx_dim_content_documents_video
        ON dim_content_documents(video_id);

      CREATE VIRTUAL TABLE IF NOT EXISTS fts_content_documents USING fts5(
        title,
        description,
        transcript,
        content='dim_content_documents',
        content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2'
      );

      CREATE TRIGGER IF NOT EXISTS trg_content_documents_ai
      AFTER INSERT ON dim_content_documents
      BEGIN
        INSERT INTO fts_content_documents(rowid, title, description, transcript)
        VALUES (new.rowid, new.title, new.description, new.transcript);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_content_documents_ad
      AFTER DELETE ON dim_content_documents
      BEGIN
        INSERT INTO fts_content_documents(fts_content_documents, rowid, title, description, transcript)
        VALUES ('delete', old.rowid, old.title, old.description, old.transcript);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_content_documents_au
      AFTER UPDATE ON dim_content_documents
      BEGIN
        INSERT INTO fts_content_documents(fts_content_documents, rowid, title, description, transcript)
        VALUES ('delete', old.rowid, old.title, old.description, old.transcript);
        INSERT INTO fts_content_documents(rowid, title, description, transcript)
        VALUES (new.rowid, new.title, new.description, new.transcript);
      END;

      INSERT INTO fts_content_documents(rowid, title, description, transcript)
      SELECT rowid, title, description, transcript
      FROM dim_content_documents;
    `);
  },
};

