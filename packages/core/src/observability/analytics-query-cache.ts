import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError, err, ok, type Result } from '@moze/shared';

const CACHE_REVISION_META_KEY = 'analytics.cache.revision';
const DEFAULT_WINDOW_HOURS = 24;

type CacheEventType = 'hit' | 'miss' | 'set' | 'invalidate' | 'stale';

interface CacheEntryRow {
  metricId: string;
  paramsHash: string;
  revision: number;
  payloadJson: string;
  expiresAt: string;
}

interface CacheMetricEventRow {
  metricId: string;
  hits: number;
  misses: number;
}

interface CacheTotalsRow {
  hits: number;
  misses: number;
  invalidations: number;
}

interface DurationRow {
  operationName: string;
  durationMs: number;
}

export interface AnalyticsCacheMetricStats {
  metricId: string;
  hits: number;
  misses: number;
  hitRate: number;
}

export interface AnalyticsOperationLatencyStats {
  operationName: string;
  sampleSize: number;
  p50Ms: number;
  p95Ms: number;
}

export interface AnalyticsPerformanceSnapshot {
  generatedAt: string;
  windowHours: number;
  cache: {
    revision: number;
    activeEntries: number;
    hits: number;
    misses: number;
    hitRate: number;
    invalidations: number;
    metrics: AnalyticsCacheMetricStats[];
  };
  latencies: {
    sampleSize: number;
    p50Ms: number;
    p95Ms: number;
    operations: AnalyticsOperationLatencyStats[];
  };
}

export interface CachedQueryInput<T> {
  metricId: string;
  params: Record<string, unknown>;
  ttlMs: number;
  execute: () => Result<T, AppError>;
  validate: (payload: unknown) => Result<T, AppError>;
  now?: () => Date;
}

export interface InvalidateAnalyticsCacheResult {
  revision: number;
  invalidatedEntries: number;
}

export interface AnalyticsQueryCache {
  getOrCompute: <T>(input: CachedQueryInput<T>) => Result<T, AppError>;
  invalidateAll: (input?: { reason?: string; now?: () => Date }) => Result<InvalidateAnalyticsCacheResult, AppError>;
  getPerformanceSnapshot: (input?: { windowHours?: number; now?: () => Date }) => Result<AnalyticsPerformanceSnapshot, AppError>;
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

function toNumber(value: number | bigint): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return value;
}

function getNonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.round(value);
}

function normalizeWindowHours(input?: number): number {
  if (!Number.isFinite(input) || input === undefined) {
    return DEFAULT_WINDOW_HOURS;
  }
  const normalized = Math.floor(input);
  return Math.min(24 * 30, Math.max(1, normalized));
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableNormalize(item));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    entries.sort(([left], [right]) => left.localeCompare(right));
    const normalized: Record<string, unknown> = {};
    for (const [key, item] of entries) {
      normalized[key] = stableNormalize(item);
    }
    return normalized;
  }
  return value;
}

function stableHash(value: unknown): string {
  const serialized = safeJsonStringify(stableNormalize(value));
  return createHash('sha256').update(serialized).digest('hex');
}

function isFutureIsoDate(value: string, nowIso: string): boolean {
  return value > nowIso;
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(0, Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1));
  const point = sorted[rank];
  return getNonNegativeInt(point ?? 0);
}

function safeParseJson(value: string): Result<unknown, AppError> {
  try {
    return ok(JSON.parse(value));
  } catch (cause) {
    return err(
      AppError.create(
        'ANALYTICS_CACHE_PAYLOAD_INVALID_JSON',
        'Nie udalo sie sparsowac payload cache analityki.',
        'error',
        {},
        toError(cause),
      ),
    );
  }
}

export function createAnalyticsQueryCache(db: Database.Database): AnalyticsQueryCache {
  const getRevisionStmt = db.prepare<{ key: string }, { value: string }>(
    `
      SELECT value
      FROM app_meta
      WHERE key = @key
      ORDER BY key ASC
      LIMIT 1
    `,
  );
  const upsertRevisionStmt = db.prepare<{ key: string; value: string; updatedAt: string }>(
    `
      INSERT INTO app_meta (key, value, updated_at)
      VALUES (@key, @value, @updatedAt)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
  );
  const getEntryStmt = db.prepare<{ metricId: string; paramsHash: string }, CacheEntryRow>(
    `
      SELECT
        metric_id AS metricId,
        params_hash AS paramsHash,
        revision,
        payload_json AS payloadJson,
        expires_at AS expiresAt
      FROM analytics_query_cache
      WHERE metric_id = @metricId
        AND params_hash = @paramsHash
      ORDER BY metric_id ASC, params_hash ASC
      LIMIT 1
    `,
  );
  const upsertEntryStmt = db.prepare<{
    metricId: string;
    paramsHash: string;
    revision: number;
    payloadJson: string;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
  }>(
    `
      INSERT INTO analytics_query_cache (
        metric_id,
        params_hash,
        revision,
        payload_json,
        expires_at,
        created_at,
        updated_at
      )
      VALUES (
        @metricId,
        @paramsHash,
        @revision,
        @payloadJson,
        @expiresAt,
        @createdAt,
        @updatedAt
      )
      ON CONFLICT(metric_id, params_hash) DO UPDATE SET
        revision = excluded.revision,
        payload_json = excluded.payload_json,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `,
  );
  const deleteEntryStmt = db.prepare<{ metricId: string; paramsHash: string }>(
    `
      DELETE FROM analytics_query_cache
      WHERE metric_id = @metricId
        AND params_hash = @paramsHash
    `,
  );
  const deleteAllEntriesStmt = db.prepare(
    `
      DELETE FROM analytics_query_cache
    `,
  );
  const insertEventStmt = db.prepare<{
    metricId: string;
    paramsHash: string;
    revision: number;
    eventType: CacheEventType;
    durationMs: number;
    metadataJson: string;
    createdAt: string;
  }>(
    `
      INSERT INTO analytics_cache_events (
        metric_id,
        params_hash,
        revision,
        event_type,
        duration_ms,
        metadata_json,
        created_at
      )
      VALUES (
        @metricId,
        @paramsHash,
        @revision,
        @eventType,
        @durationMs,
        @metadataJson,
        @createdAt
      )
    `,
  );
  const activeEntriesStmt = db.prepare<{ revision: number; nowIso: string }, { total: number }>(
    `
      SELECT COUNT(*) AS total
      FROM analytics_query_cache
      WHERE revision = @revision
        AND expires_at > @nowIso
    `,
  );
  const cacheTotalsStmt = db.prepare<{ sinceIso: string }, CacheTotalsRow>(
    `
      SELECT
        SUM(CASE WHEN event_type = 'hit' THEN 1 ELSE 0 END) AS hits,
        SUM(CASE WHEN event_type = 'miss' THEN 1 ELSE 0 END) AS misses,
        SUM(CASE WHEN event_type = 'invalidate' THEN 1 ELSE 0 END) AS invalidations
      FROM analytics_cache_events
      WHERE created_at >= @sinceIso
    `,
  );
  const metricEventsStmt = db.prepare<{ sinceIso: string }, CacheMetricEventRow>(
    `
      SELECT
        metric_id AS metricId,
        SUM(CASE WHEN event_type = 'hit' THEN 1 ELSE 0 END) AS hits,
        SUM(CASE WHEN event_type = 'miss' THEN 1 ELSE 0 END) AS misses
      FROM analytics_cache_events
      WHERE created_at >= @sinceIso
        AND metric_id <> '*'
      GROUP BY metric_id
      ORDER BY metric_id ASC
    `,
  );
  const durationsStmt = db.prepare<{ sinceIso: string }, DurationRow>(
    `
      SELECT
        operation_name AS operationName,
        duration_ms AS durationMs
      FROM analytics_trace_runs
      WHERE started_at >= @sinceIso
        AND status = 'ok'
      ORDER BY operation_name ASC, duration_ms ASC, id ASC
    `,
  );

  const readRevision = (): number => {
    const row = getRevisionStmt.get({ key: CACHE_REVISION_META_KEY });
    if (!row) {
      return 0;
    }
    const parsed = Number(row.value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.floor(parsed);
  };

  const persistRevision = (revision: number, updatedAt: string): void => {
    upsertRevisionStmt.run({
      key: CACHE_REVISION_META_KEY,
      value: String(revision),
      updatedAt,
    });
  };

  const recordEvent = (input: {
    metricId: string;
    paramsHash: string;
    revision: number;
    eventType: CacheEventType;
    durationMs: number;
    metadata?: Record<string, unknown>;
    createdAt: string;
  }): void => {
    try {
      insertEventStmt.run({
        metricId: input.metricId,
        paramsHash: input.paramsHash,
        revision: input.revision,
        eventType: input.eventType,
        durationMs: getNonNegativeInt(input.durationMs),
        metadataJson: safeJsonStringify(input.metadata ?? {}),
        createdAt: input.createdAt,
      });
    } catch {
      // Event persistence is best-effort and must not break query flow.
    }
  };

  return {
    getOrCompute: <T>(input: CachedQueryInput<T>): Result<T, AppError> => {
      const now = input.now ?? (() => new Date());
      const startedAtDate = now();
      const startedAtIso = startedAtDate.toISOString();
      const metricId = input.metricId;
      const paramsHash = stableHash(input.params);
      const ttlMs = Math.max(1, Math.floor(input.ttlMs));

      let revision: number;
      try {
        revision = readRevision();
      } catch {
        // If revision lookup fails, fallback to uncached execution.
        return input.execute();
      }

      try {
        const cachedEntry = getEntryStmt.get({ metricId, paramsHash });
        if (
          cachedEntry
          && cachedEntry.revision === revision
          && isFutureIsoDate(cachedEntry.expiresAt, startedAtIso)
        ) {
          const parsedPayloadResult = safeParseJson(cachedEntry.payloadJson);
          if (parsedPayloadResult.ok) {
            const validatedPayload = input.validate(parsedPayloadResult.value);
            if (validatedPayload.ok) {
              const durationMs = now().getTime() - startedAtDate.getTime();
              recordEvent({
                metricId,
                paramsHash,
                revision,
                eventType: 'hit',
                durationMs,
                createdAt: now().toISOString(),
              });
              return validatedPayload;
            }
          }

          deleteEntryStmt.run({ metricId, paramsHash });
          recordEvent({
            metricId,
            paramsHash,
            revision,
            eventType: 'stale',
            durationMs: 0,
            metadata: { reason: 'payload-invalid' },
            createdAt: now().toISOString(),
          });
        } else if (cachedEntry) {
          deleteEntryStmt.run({ metricId, paramsHash });
          recordEvent({
            metricId,
            paramsHash,
            revision,
            eventType: 'stale',
            durationMs: 0,
            metadata: {
              reason: cachedEntry.revision !== revision ? 'revision-mismatch' : 'expired',
            },
            createdAt: now().toISOString(),
          });
        }
      } catch {
        return input.execute();
      }

      const executionResult = input.execute();
      const finishedAt = now();
      const finishedAtIso = finishedAt.toISOString();
      const durationMs = finishedAt.getTime() - startedAtDate.getTime();
      recordEvent({
        metricId,
        paramsHash,
        revision,
        eventType: 'miss',
        durationMs,
        createdAt: finishedAtIso,
      });

      if (executionResult.ok) {
        try {
          const expiresAt = new Date(finishedAt.getTime() + ttlMs).toISOString();
          upsertEntryStmt.run({
            metricId,
            paramsHash,
            revision,
            payloadJson: safeJsonStringify(executionResult.value),
            expiresAt,
            createdAt: finishedAtIso,
            updatedAt: finishedAtIso,
          });
          recordEvent({
            metricId,
            paramsHash,
            revision,
            eventType: 'set',
            durationMs: 0,
            metadata: { ttlMs },
            createdAt: finishedAtIso,
          });
        } catch {
          // Cache write failure should not break analytical result.
        }
      }

      return executionResult;
    },

    invalidateAll: (input) => {
      const now = input?.now ?? (() => new Date());
      const timestamp = now().toISOString();

      try {
        const result = db.transaction(() => {
          const nextRevision = readRevision() + 1;
          persistRevision(nextRevision, timestamp);
          const deleteResult = deleteAllEntriesStmt.run();
          const invalidatedEntries = getNonNegativeInt(toNumber(deleteResult.changes));
          return {
            revision: nextRevision,
            invalidatedEntries,
          };
        })();

        recordEvent({
          metricId: '*',
          paramsHash: '*',
          revision: result.revision,
          eventType: 'invalidate',
          durationMs: 0,
          metadata: {
            reason: input?.reason ?? 'manual',
            invalidatedEntries: result.invalidatedEntries,
          },
          createdAt: timestamp,
        });

        return ok(result);
      } catch (cause) {
        return err(
          AppError.create(
            'ANALYTICS_CACHE_INVALIDATE_FAILED',
            'Nie udalo sie zainwalidowac cache analityki.',
            'error',
            { reason: input?.reason ?? 'manual' },
            toError(cause),
          ),
        );
      }
    },

    getPerformanceSnapshot: (input) => {
      const now = input?.now ?? (() => new Date());
      const generatedAt = now();
      const generatedAtIso = generatedAt.toISOString();
      const windowHours = normalizeWindowHours(input?.windowHours);
      const sinceIso = new Date(generatedAt.getTime() - windowHours * 3_600_000).toISOString();

      try {
        const revision = readRevision();
        const activeEntriesRow = activeEntriesStmt.get({ revision, nowIso: generatedAtIso });
        const totalsRow = cacheTotalsStmt.get({ sinceIso });
        const metricRows = metricEventsStmt.all({ sinceIso });
        const durationRows = durationsStmt.all({ sinceIso });

        const hits = getNonNegativeInt(totalsRow?.hits ?? 0);
        const misses = getNonNegativeInt(totalsRow?.misses ?? 0);
        const invalidations = getNonNegativeInt(totalsRow?.invalidations ?? 0);
        const hitRate = hits + misses > 0 ? hits / (hits + misses) : 0;

        const metricStats: AnalyticsCacheMetricStats[] = metricRows
          .map((row) => {
            const metricHits = getNonNegativeInt(row.hits);
            const metricMisses = getNonNegativeInt(row.misses);
            const metricHitRate = metricHits + metricMisses > 0
              ? metricHits / (metricHits + metricMisses)
              : 0;
            return {
              metricId: row.metricId,
              hits: metricHits,
              misses: metricMisses,
              hitRate: metricHitRate,
            };
          });

        const allDurations = durationRows.map((row) => getNonNegativeInt(row.durationMs));
        const durationByOperation = new Map<string, number[]>();
        for (const row of durationRows) {
          const list = durationByOperation.get(row.operationName);
          if (list) {
            list.push(getNonNegativeInt(row.durationMs));
          } else {
            durationByOperation.set(row.operationName, [getNonNegativeInt(row.durationMs)]);
          }
        }

        const operationStats: AnalyticsOperationLatencyStats[] = [];
        const operationNames = [...durationByOperation.keys()].sort((left, right) => left.localeCompare(right));
        for (const operationName of operationNames) {
          const durations = durationByOperation.get(operationName) ?? [];
          operationStats.push({
            operationName,
            sampleSize: durations.length,
            p50Ms: percentile(durations, 0.5),
            p95Ms: percentile(durations, 0.95),
          });
        }

        return ok({
          generatedAt: generatedAtIso,
          windowHours,
          cache: {
            revision,
            activeEntries: getNonNegativeInt(activeEntriesRow?.total ?? 0),
            hits,
            misses,
            hitRate,
            invalidations,
            metrics: metricStats,
          },
          latencies: {
            sampleSize: allDurations.length,
            p50Ms: percentile(allDurations, 0.5),
            p95Ms: percentile(allDurations, 0.95),
            operations: operationStats,
          },
        });
      } catch (cause) {
        return err(
          AppError.create(
            'ANALYTICS_PERF_SNAPSHOT_FAILED',
            'Nie udalo sie odczytac metryk wydajnosci analityki.',
            'error',
            { windowHours },
            toError(cause),
          ),
        );
      }
    },
  };
}
