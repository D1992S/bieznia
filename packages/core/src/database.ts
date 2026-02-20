import Database from 'better-sqlite3';
import { AppError, err, ok, type Result } from '@moze/shared';

export interface CreateDatabaseInput {
  filename?: string;
  readonly?: boolean;
  fileMustExist?: boolean;
  timeoutMs?: number;
}

export interface DatabaseConnection {
  readonly db: Database.Database;
  close: () => Result<void, AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

export function createDatabaseConnection(input: CreateDatabaseInput = {}): Result<DatabaseConnection, AppError> {
  const filename = input.filename ?? ':memory:';
  const timeoutMs = input.timeoutMs ?? 5_000;

  try {
    const db = new Database(filename, {
      readonly: input.readonly ?? false,
      fileMustExist: input.fileMustExist ?? false,
      timeout: timeoutMs,
    });

    db.pragma('foreign_keys = ON');
    db.pragma(`busy_timeout = ${String(timeoutMs)}`);

    if (!db.memory) {
      db.pragma('journal_mode = WAL');
    }

    return ok({
      db,
      close: () => closeDatabaseConnection(db),
    });
  } catch (cause) {
    return err(
      AppError.create(
        'DB_OPEN_FAILED',
        'Nie udało się otworzyć bazy danych.',
        'error',
        { filename, timeoutMs },
        toError(cause),
      ),
    );
  }
}

export function closeDatabaseConnection(db: Database.Database): Result<void, AppError> {
  try {
    if (db.open) {
      db.close();
    }
    return ok(undefined);
  } catch (cause) {
    return err(
      AppError.create(
        'DB_CLOSE_FAILED',
        'Nie udało się zamknąć bazy danych.',
        'error',
        { databaseName: db.name },
        toError(cause),
      ),
    );
  }
}
