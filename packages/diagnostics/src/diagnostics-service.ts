import type {
  AnalyticsPerformanceSnapshot,
  DatabaseConnection,
  InvalidateAnalyticsCacheResult,
} from '@moze/core';
import {
  AppError,
  err,
  ok,
  type DiagnosticsGetHealthInputDTO,
  type DiagnosticsHealthCheckItemDTO,
  type DiagnosticsHealthResultDTO,
  type DiagnosticsRecoveryAction,
  type DiagnosticsRunRecoveryInputDTO,
  type DiagnosticsRunRecoveryResultDTO,
  type DiagnosticsRecoveryStepResultDTO,
  type Result,
} from '@moze/shared';

export interface DiagnosticsPipelineRecoveryResult {
  generatedFeatures: number;
  latestFeatureDate: string | null;
}

export interface DiagnosticsHealthDependencies {
  readCacheSnapshot?: (input: { windowHours: number }) => Result<AnalyticsPerformanceSnapshot, AppError>;
}

export interface DiagnosticsRecoveryDependencies {
  invalidateAnalyticsCache?: () => Result<InvalidateAnalyticsCacheResult, AppError>;
  rerunDataPipeline?: (input: {
    channelId: string;
    dateFrom: string;
    dateTo: string;
  }) => Result<DiagnosticsPipelineRecoveryResult, AppError>;
}

interface TimeSource {
  now: () => Date;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function createDiagnosticsError(
  code: string,
  message: string,
  context: Record<string, unknown>,
  cause?: unknown,
): AppError {
  return AppError.create(code, message, 'error', context, cause ? toError(cause) : undefined);
}

function toUtcDayNumber(dateIso: string): number {
  const timestamp = Date.parse(`${dateIso}T00:00:00.000Z`);
  return Math.floor(timestamp / 86_400_000);
}

function resolveOverallHealthStatus(
  checks: readonly DiagnosticsHealthCheckItemDTO[],
): DiagnosticsHealthResultDTO['overallStatus'] {
  if (checks.some((check) => check.status === 'error')) {
    return 'error';
  }
  if (checks.some((check) => check.status === 'warning')) {
    return 'warning';
  }
  return 'ok';
}

function resolveOverallRecoveryStatus(
  steps: readonly DiagnosticsRecoveryStepResultDTO[],
): DiagnosticsRunRecoveryResultDTO['overallStatus'] {
  if (steps.some((step) => step.status === 'failed')) {
    return 'failed';
  }
  if (steps.some((step) => step.status === 'skipped')) {
    return 'partial';
  }
  return 'ok';
}

function validateDateRange(input: { dateFrom: string; dateTo: string }): Result<void, AppError> {
  if (input.dateFrom > input.dateTo) {
    return err(
      createDiagnosticsError(
        'DIAGNOSTICS_INVALID_DATE_RANGE',
        'Data początkowa nie może być późniejsza niż końcowa.',
        {
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        },
      ),
    );
  }

  return ok(undefined);
}

function readDbIntegrityCheck(
  db: DatabaseConnection['db'],
): Result<{ quickCheck: string; foreignKeyViolations: number }, AppError> {
  try {
    const quickCheckRaw = db.prepare('PRAGMA quick_check').pluck().get();
    const quickCheck = typeof quickCheckRaw === 'string'
      ? quickCheckRaw
      : typeof quickCheckRaw === 'number' || typeof quickCheckRaw === 'bigint' || typeof quickCheckRaw === 'boolean'
        ? String(quickCheckRaw)
        : 'unknown';
    const foreignKeyRows = db.prepare('PRAGMA foreign_key_check').all();
    return ok({
      quickCheck,
      foreignKeyViolations: foreignKeyRows.length,
    });
  } catch (cause) {
    return err(
      createDiagnosticsError(
        'DIAGNOSTICS_DB_INTEGRITY_READ_FAILED',
        'Nie udało się odczytać integralności bazy danych.',
        {},
        cause,
      ),
    );
  }
}

function buildDbHealthCheck(
  db: DatabaseConnection['db'],
  timeSource: TimeSource,
): DiagnosticsHealthCheckItemDTO {
  const startedAt = timeSource.now().getTime();
  const integrityResult = readDbIntegrityCheck(db);
  const durationMs = Math.max(0, timeSource.now().getTime() - startedAt);

  if (!integrityResult.ok) {
    return {
      checkId: 'db.integrity',
      module: 'db',
      status: 'error',
      message: integrityResult.error.message,
      durationMs,
      details: { code: integrityResult.error.code },
    };
  }

  const hasIntegrityIssue = integrityResult.value.quickCheck.toLowerCase() !== 'ok'
    || integrityResult.value.foreignKeyViolations > 0;
  if (hasIntegrityIssue) {
    return {
      checkId: 'db.integrity',
      module: 'db',
      status: 'error',
      message: 'Wykryto problem integralności bazy danych.',
      durationMs,
      details: integrityResult.value,
    };
  }

  return {
    checkId: 'db.integrity',
    module: 'db',
    status: 'ok',
    message: 'Integralność bazy danych jest poprawna.',
    durationMs,
    details: integrityResult.value,
  };
}

function buildPipelineFreshnessCheck(
  db: DatabaseConnection['db'],
  input: DiagnosticsGetHealthInputDTO,
  timeSource: TimeSource,
): DiagnosticsHealthCheckItemDTO {
  const startedAt = timeSource.now().getTime();
  try {
    const row = db
      .prepare<
        { channelId: string; dateFrom: string; dateTo: string },
        { latestDate: string | null; rowsInRange: number }
      >(
        `
          SELECT
            MAX(date) AS latestDate,
            COUNT(*) AS rowsInRange
          FROM fact_channel_day
          WHERE channel_id = @channelId
            AND date >= @dateFrom
            AND date <= @dateTo
        `,
      )
      .get({
        channelId: input.channelId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      });

    const durationMs = Math.max(0, timeSource.now().getTime() - startedAt);
    if (!row || !row.latestDate) {
      return {
        checkId: 'pipeline.freshness',
        module: 'pipeline',
        status: 'warning',
        message: 'Brak danych kanału w wybranym zakresie.',
        durationMs,
        details: {
          channelId: input.channelId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          rowsInRange: row?.rowsInRange ?? 0,
        },
      };
    }

    const gapDays = Math.max(0, toUtcDayNumber(input.dateTo) - toUtcDayNumber(row.latestDate));
    if (gapDays > 3) {
      return {
        checkId: 'pipeline.freshness',
        module: 'pipeline',
        status: 'warning',
        message: 'Dane kanału są nieświeże względem końca zakresu.',
        durationMs,
        details: {
          latestDate: row.latestDate,
          gapDays,
          rowsInRange: row.rowsInRange,
        },
      };
    }

    return {
      checkId: 'pipeline.freshness',
      module: 'pipeline',
      status: 'ok',
      message: 'Dane kanału są świeże dla wybranego zakresu.',
      durationMs,
      details: {
        latestDate: row.latestDate,
        gapDays,
        rowsInRange: row.rowsInRange,
      },
    };
  } catch (cause) {
    return {
      checkId: 'pipeline.freshness',
      module: 'pipeline',
      status: 'error',
      message: 'Nie udało się zweryfikować świeżości danych pipeline.',
      durationMs: Math.max(0, timeSource.now().getTime() - startedAt),
      details: {
        error: String(cause),
      },
    };
  }
}

function buildCacheHealthCheck(
  dependencies: DiagnosticsHealthDependencies,
  input: DiagnosticsGetHealthInputDTO,
  timeSource: TimeSource,
): DiagnosticsHealthCheckItemDTO {
  const startedAt = timeSource.now().getTime();
  if (!dependencies.readCacheSnapshot) {
    return {
      checkId: 'cache.snapshot',
      module: 'cache',
      status: 'warning',
      message: 'Cache analityki nie jest dostępny w runtime.',
      durationMs: Math.max(0, timeSource.now().getTime() - startedAt),
      details: {},
    };
  }

  const snapshotResult = dependencies.readCacheSnapshot({ windowHours: input.windowHours });
  const durationMs = Math.max(0, timeSource.now().getTime() - startedAt);
  if (!snapshotResult.ok) {
    return {
      checkId: 'cache.snapshot',
      module: 'cache',
      status: 'warning',
      message: 'Nie udało się odczytać metryk cache analityki.',
      durationMs,
      details: { code: snapshotResult.error.code },
    };
  }

  const lowHitRate = snapshotResult.value.cache.hitRate < 0.2 && snapshotResult.value.cache.hits + snapshotResult.value.cache.misses >= 10;
  if (lowHitRate) {
    return {
      checkId: 'cache.snapshot',
      module: 'cache',
      status: 'warning',
      message: 'Cache analityki działa, ale hit-rate jest niski.',
      durationMs,
      details: {
        hitRate: snapshotResult.value.cache.hitRate,
        hits: snapshotResult.value.cache.hits,
        misses: snapshotResult.value.cache.misses,
        invalidations: snapshotResult.value.cache.invalidations,
      },
    };
  }

  return {
    checkId: 'cache.snapshot',
    module: 'cache',
    status: 'ok',
    message: 'Cache analityki działa poprawnie.',
    durationMs,
    details: {
      hitRate: snapshotResult.value.cache.hitRate,
      hits: snapshotResult.value.cache.hits,
      misses: snapshotResult.value.cache.misses,
      invalidations: snapshotResult.value.cache.invalidations,
    },
  };
}

function buildIpcHealthCheck(timeSource: TimeSource): DiagnosticsHealthCheckItemDTO {
  const startedAt = timeSource.now().getTime();
  return {
    checkId: 'ipc.bridge',
    module: 'ipc',
    status: 'ok',
    message: 'Most IPC odpowiada i przekazuje wynik diagnostyki.',
    durationMs: Math.max(0, timeSource.now().getTime() - startedAt),
    details: {},
  };
}

function executeRecoveryAction(
  action: DiagnosticsRecoveryAction,
  input: DiagnosticsRunRecoveryInputDTO,
  db: DatabaseConnection['db'],
  dependencies: DiagnosticsRecoveryDependencies,
  timeSource: TimeSource,
): DiagnosticsRecoveryStepResultDTO {
  const startedAt = timeSource.now().getTime();

  const finish = (
    status: DiagnosticsRecoveryStepResultDTO['status'],
    message: string,
    details: DiagnosticsRecoveryStepResultDTO['details'],
  ): DiagnosticsRecoveryStepResultDTO => ({
    action,
    status,
    message,
    durationMs: Math.max(0, timeSource.now().getTime() - startedAt),
    details,
  });

  try {
    if (action === 'invalidate_analytics_cache') {
      if (!dependencies.invalidateAnalyticsCache) {
        return finish('skipped', 'Pominięto invalidację cache, bo runtime cache nie jest podłączony.', {});
      }

      const invalidateResult = dependencies.invalidateAnalyticsCache();
      if (!invalidateResult.ok) {
        return finish(
          'failed',
          'Nie udało się zainwalidować cache analityki.',
          { code: invalidateResult.error.code },
        );
      }

      return finish(
        'ok',
        'Zainwalidowano cache analityki.',
        {
          revision: invalidateResult.value.revision,
          invalidatedEntries: invalidateResult.value.invalidatedEntries,
        },
      );
    }

    if (action === 'rerun_data_pipeline') {
      if (!dependencies.rerunDataPipeline) {
        return finish('skipped', 'Pominięto przeliczenie pipeline, bo akcja nie jest podłączona w runtime.', {});
      }

      const rerunResult = dependencies.rerunDataPipeline({
        channelId: input.channelId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      });
      if (!rerunResult.ok) {
        return finish('failed', 'Nie udało się ponownie uruchomić pipeline danych.', { code: rerunResult.error.code });
      }

      return finish(
        'ok',
        'Przeliczono pipeline danych dla wybranego zakresu.',
        {
          generatedFeatures: rerunResult.value.generatedFeatures,
          latestFeatureDate: rerunResult.value.latestFeatureDate,
        },
      );
    }

    if (action === 'vacuum_database') {
      db.exec('VACUUM');
      return finish('ok', 'Wykonano VACUUM bazy danych.', {});
    }

    if (action === 'reindex_fts') {
      const ftsTable = db
        .prepare<[], { name: string }>(
          `
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name = 'fts_content_documents'
            ORDER BY name ASC
            LIMIT 1
          `,
        )
        .get();

      if (!ftsTable) {
        return finish('skipped', 'Pominięto REINDEX FTS, bo tabela FTS nie istnieje.', {});
      }

      db.exec('REINDEX fts_content_documents');
      return finish('ok', 'Wykonano REINDEX dla FTS content documents.', {});
    }

    const integrityResult = readDbIntegrityCheck(db);
    if (!integrityResult.ok) {
      return finish(
        'failed',
        'Nie udało się wykonać kontroli integralności bazy danych.',
        { code: integrityResult.error.code },
      );
    }

    if (integrityResult.value.quickCheck.toLowerCase() !== 'ok' || integrityResult.value.foreignKeyViolations > 0) {
      return finish(
        'failed',
        'Kontrola integralności wykryła problemy w bazie danych.',
        integrityResult.value,
      );
    }

    return finish('ok', 'Szybki check integralności zakończył się powodzeniem.', integrityResult.value);
  } catch (cause) {
    return finish('failed', 'Akcja recovery zakończyła się błędem wykonania.', { error: String(cause) });
  }
}

export function getDiagnosticsHealth(
  input: {
    db: DatabaseConnection['db'];
    health: DiagnosticsGetHealthInputDTO;
    dependencies?: DiagnosticsHealthDependencies;
    now?: () => Date;
  },
): Result<DiagnosticsHealthResultDTO, AppError> {
  const rangeValidation = validateDateRange(input.health);
  if (!rangeValidation.ok) {
    return rangeValidation;
  }

  const timeSource: TimeSource = {
    now: input.now ?? (() => new Date()),
  };
  const dependencies = input.dependencies ?? {};
  const checks: DiagnosticsHealthCheckItemDTO[] = [
    buildDbHealthCheck(input.db, timeSource),
    buildCacheHealthCheck(dependencies, input.health, timeSource),
    buildPipelineFreshnessCheck(input.db, input.health, timeSource),
    buildIpcHealthCheck(timeSource),
  ];

  return ok({
    generatedAt: timeSource.now().toISOString(),
    channelId: input.health.channelId,
    dateFrom: input.health.dateFrom,
    dateTo: input.health.dateTo,
    windowHours: input.health.windowHours,
    overallStatus: resolveOverallHealthStatus(checks),
    checks,
  });
}

export function runDiagnosticsRecovery(
  input: {
    db: DatabaseConnection['db'];
    recovery: DiagnosticsRunRecoveryInputDTO;
    dependencies?: DiagnosticsRecoveryDependencies;
    now?: () => Date;
  },
): Result<DiagnosticsRunRecoveryResultDTO, AppError> {
  const rangeValidation = validateDateRange(input.recovery);
  if (!rangeValidation.ok) {
    return rangeValidation;
  }

  const timeSource: TimeSource = {
    now: input.now ?? (() => new Date()),
  };
  const dependencies = input.dependencies ?? {};
  const uniqueActions: DiagnosticsRecoveryAction[] = [];
  for (const action of input.recovery.actions) {
    if (!uniqueActions.includes(action)) {
      uniqueActions.push(action);
    }
  }

  const steps = uniqueActions.map((action) =>
    executeRecoveryAction(action, input.recovery, input.db, dependencies, timeSource));
  return ok({
    generatedAt: timeSource.now().toISOString(),
    channelId: input.recovery.channelId,
    dateFrom: input.recovery.dateFrom,
    dateTo: input.recovery.dateTo,
    requestedActions: uniqueActions,
    overallStatus: resolveOverallRecoveryStatus(steps),
    steps,
  });
}
