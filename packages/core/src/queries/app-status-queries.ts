import type Database from 'better-sqlite3';
import { AppError, err, ok, type Result } from '@moze/shared';

interface LatestSyncRunStatusRow {
  status: string;
  finishedAt: string | null;
}

interface LatestChannelSyncRow {
  lastSyncAt: string | null;
}

interface LatestFinishedSyncRunRow {
  finishedAt: string | null;
}

export interface AppStatusQueries {
  getLatestSyncRunStatus: () => Result<LatestSyncRunStatusRow | null, AppError>;
  getLatestChannelSyncAt: () => Result<string | null, AppError>;
  getLatestFinishedSyncAt: () => Result<string | null, AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

export function createAppStatusQueries(db: Database.Database): AppStatusQueries {
  const getLatestSyncRunStatusStmt = db.prepare<[], LatestSyncRunStatusRow>(
    `
      SELECT
        status,
        finished_at AS finishedAt
      FROM sync_runs
      ORDER BY started_at DESC, id DESC
      LIMIT 1
    `,
  );

  const getLatestChannelSyncStmt = db.prepare<[], LatestChannelSyncRow>(
    `
      SELECT
        last_sync_at AS lastSyncAt
      FROM dim_channel
      WHERE last_sync_at IS NOT NULL
      ORDER BY last_sync_at DESC, channel_id ASC
      LIMIT 1
    `,
  );

  const getLatestFinishedSyncRunStmt = db.prepare<[], LatestFinishedSyncRunRow>(
    `
      SELECT
        finished_at AS finishedAt
      FROM sync_runs
      WHERE finished_at IS NOT NULL
      ORDER BY finished_at DESC, id DESC
      LIMIT 1
    `,
  );

  return {
    getLatestSyncRunStatus: () => {
      try {
        return ok(getLatestSyncRunStatusStmt.get() ?? null);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_APP_STATUS_SYNC_RUN_READ_FAILED',
            'Nie udalo sie odczytac statusu ostatniego sync run.',
            'error',
            {},
            toError(cause),
          ),
        );
      }
    },

    getLatestChannelSyncAt: () => {
      try {
        const row = getLatestChannelSyncStmt.get();
        return ok(row?.lastSyncAt ?? null);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_APP_STATUS_CHANNEL_SYNC_READ_FAILED',
            'Nie udalo sie odczytac daty ostatniej synchronizacji kanalu.',
            'error',
            {},
            toError(cause),
          ),
        );
      }
    },

    getLatestFinishedSyncAt: () => {
      try {
        const row = getLatestFinishedSyncRunStmt.get();
        return ok(row?.finishedAt ?? null);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_APP_STATUS_FINISHED_SYNC_READ_FAILED',
            'Nie udalo sie odczytac daty ostatnio zakonczonej synchronizacji.',
            'error',
            {},
            toError(cause),
          ),
        );
      }
    },
  };
}
