import type Database from 'better-sqlite3';

export interface MigrationDefinition {
  id: number;
  name: string;
  up: (db: Database.Database) => void;
}
