import type Database from 'better-sqlite3';
import { AppError, err, ok, type Result } from '@moze/shared';
import { initialSchemaMigration } from './001-initial-schema.ts';
import { dataPipelineSchemaMigration } from './002-data-pipeline-schema.ts';
import { mlFrameworkSchemaMigration } from './003-ml-framework-schema.ts';
import { importSearchSchemaMigration } from './004-import-search-schema.ts';
import { mlAnomalyTrendSchemaMigration } from './005-ml-anomaly-trend-schema.ts';
import { analyticsTraceSchemaMigration } from './006-analytics-trace-schema.ts';
import { assistantLiteSchemaMigration } from './007-assistant-lite-schema.ts';
import { analyticsQueryCacheSchemaMigration } from './008-analytics-query-cache-schema.ts';
import { qualityScoringSchemaMigration } from './009-quality-scoring-schema.ts';
import type { MigrationDefinition } from './types.ts';

export type { MigrationDefinition } from './types.ts';

export interface RunMigrationsResult {
  applied: string[];
  alreadyApplied: string[];
}

export const MIGRATIONS: ReadonlyArray<MigrationDefinition> = [
  initialSchemaMigration,
  dataPipelineSchemaMigration,
  mlFrameworkSchemaMigration,
  importSearchSchemaMigration,
  mlAnomalyTrendSchemaMigration,
  analyticsTraceSchemaMigration,
  assistantLiteSchemaMigration,
  analyticsQueryCacheSchemaMigration,
  qualityScoringSchemaMigration,
];

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );
  `);
}

export function runMigrations(db: Database.Database): Result<RunMigrationsResult, AppError> {
  try {
    ensureMigrationsTable(db);

    const appliedRows = db
      .prepare<[], { id: number; name: string }>(
        `
          SELECT id, name
          FROM schema_migrations
          ORDER BY id ASC
        `,
      )
      .all();

    const appliedNames = new Set<string>();
    for (const row of appliedRows) {
      appliedNames.add(row.name);
    }

    const insertMigration = db.prepare<{ id: number; name: string; appliedAt: string }>(
      `
        INSERT INTO schema_migrations (id, name, applied_at)
        VALUES (@id, @name, @appliedAt)
      `,
    );

    const applied: string[] = [];
    const alreadyApplied: string[] = [];

    for (const migration of MIGRATIONS) {
      if (appliedNames.has(migration.name)) {
        alreadyApplied.push(migration.name);
        continue;
      }

      const applyMigrationTx = db.transaction(() => {
        migration.up(db);
        insertMigration.run({
          id: migration.id,
          name: migration.name,
          appliedAt: new Date().toISOString(),
        });
      });

      applyMigrationTx();
      applied.push(migration.name);
    }

    return ok({ applied, alreadyApplied });
  } catch (cause) {
    return err(
      AppError.create(
        'DB_MIGRATION_FAILED',
        'Nie udało się uruchomić migracji bazy danych.',
        'error',
        {},
        toError(cause),
      ),
    );
  }
}
