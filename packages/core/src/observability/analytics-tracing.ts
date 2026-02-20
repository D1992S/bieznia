import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError, err, ok, type Result } from '@moze/shared';

export interface AnalyticsTraceLineageInput {
  sourceTable: string;
  primaryKeys: readonly string[];
  dateFrom?: string | null;
  dateTo?: string | null;
  filters?: Record<string, unknown>;
}

export interface RunWithAnalyticsTraceInput<T> {
  db: Database.Database;
  operationName: string;
  params: Record<string, unknown>;
  lineage: readonly AnalyticsTraceLineageInput[];
  execute: () => Result<T, AppError>;
  estimateRowCount?: (value: T) => number;
  now?: () => Date;
}

interface PersistTraceInput {
  traceId: string;
  operationName: string;
  params: Record<string, unknown>;
  lineage: readonly AnalyticsTraceLineageInput[];
  status: 'ok' | 'error';
  rowCount: number;
  durationMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ nonSerializable: true });
  }
}

function sanitizeDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return 0;
  }
  return Math.round(durationMs);
}

function sanitizeRowCount(rowCount: number): number {
  if (!Number.isFinite(rowCount) || rowCount < 0) {
    return 0;
  }
  return Math.round(rowCount);
}

function createTracedError(error: AppError, traceId: string): AppError {
  return AppError.create(
    error.code,
    error.message,
    error.severity,
    {
      ...error.context,
      traceId,
    },
    error.cause ? new Error(error.cause) : undefined,
  );
}

function persistTrace(db: Database.Database, input: PersistTraceInput): void {
  const insertRunStmt = db.prepare<{
    traceId: string;
    operationName: string;
    paramsJson: string;
    status: 'ok' | 'error';
    rowCount: number;
    durationMs: number;
    errorCode: string | null;
    errorMessage: string | null;
    startedAt: string;
    finishedAt: string;
  }>(
    `
      INSERT INTO analytics_trace_runs (
        trace_id,
        operation_name,
        params_json,
        status,
        row_count,
        duration_ms,
        error_code,
        error_message,
        started_at,
        finished_at
      )
      VALUES (
        @traceId,
        @operationName,
        @paramsJson,
        @status,
        @rowCount,
        @durationMs,
        @errorCode,
        @errorMessage,
        @startedAt,
        @finishedAt
      )
    `,
  );

  const insertLineageStmt = db.prepare<{
    traceId: string;
    sourceTable: string;
    primaryKeysJson: string;
    dateFrom: string | null;
    dateTo: string | null;
    filtersJson: string;
    createdAt: string;
  }>(
    `
      INSERT INTO analytics_trace_lineage (
        trace_id,
        source_table,
        primary_keys_json,
        date_from,
        date_to,
        filters_json,
        created_at
      )
      VALUES (
        @traceId,
        @sourceTable,
        @primaryKeysJson,
        @dateFrom,
        @dateTo,
        @filtersJson,
        @createdAt
      )
    `,
  );

  const tx = db.transaction(() => {
    insertRunStmt.run({
      traceId: input.traceId,
      operationName: input.operationName,
      paramsJson: safeJsonStringify(input.params),
      status: input.status,
      rowCount: sanitizeRowCount(input.rowCount),
      durationMs: sanitizeDuration(input.durationMs),
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
    });

    for (const lineageEntry of input.lineage) {
      insertLineageStmt.run({
        traceId: input.traceId,
        sourceTable: lineageEntry.sourceTable,
        primaryKeysJson: safeJsonStringify(lineageEntry.primaryKeys),
        dateFrom: lineageEntry.dateFrom ?? null,
        dateTo: lineageEntry.dateTo ?? null,
        filtersJson: safeJsonStringify(lineageEntry.filters ?? {}),
        createdAt: input.finishedAt,
      });
    }
  });

  tx();
}

export function runWithAnalyticsTrace<T>(input: RunWithAnalyticsTraceInput<T>): Result<T, AppError> {
  const traceId = randomUUID();
  const now = input.now ?? (() => new Date());
  const startedDate = now();
  const startedAt = startedDate.toISOString();

  let operationResult: Result<T, AppError>;
  try {
    operationResult = input.execute();
  } catch (cause) {
    operationResult = err(
      AppError.create(
        'ANALYTICS_OPERATION_THROWN',
        'Analytics operation resulted in an unhandled error.',
        'error',
        {
          operationName: input.operationName,
          traceId,
        },
        toError(cause),
      ),
    );
  }

  const finishedDate = now();
  const finishedAt = finishedDate.toISOString();
  const durationMs = finishedDate.getTime() - startedDate.getTime();

  const rowCount = operationResult.ok
    ? sanitizeRowCount(
      input.estimateRowCount ? input.estimateRowCount(operationResult.value) : 1,
    )
    : 0;

  try {
    persistTrace(input.db, {
      traceId,
      operationName: input.operationName,
      params: input.params,
      lineage: input.lineage,
      status: operationResult.ok ? 'ok' : 'error',
      rowCount,
      durationMs,
      errorCode: operationResult.ok ? null : operationResult.error.code,
      errorMessage: operationResult.ok ? null : operationResult.error.message,
      startedAt,
      finishedAt,
    });
  } catch {
    // Trace persistence is best-effort and must not block analytics reads.
  }

  if (!operationResult.ok) {
    return err(createTracedError(operationResult.error, traceId));
  }

  return ok(operationResult.value);
}
