import type Database from 'better-sqlite3';
import {
  AppError,
  ChannelInfoDTOSchema,
  err,
  ok,
  type ChannelIdDTO,
  type ChannelInfoDTO,
  type Result,
} from '@moze/shared';
import { runWithAnalyticsTrace } from '../observability/analytics-tracing.ts';
import type { AnalyticsQueryCache } from '../observability/analytics-query-cache.ts';

interface ChannelInfoRow {
  channelId: string;
  name: string;
  description: string;
  thumbnailUrl: string | null;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  createdAt: string;
  lastSyncAt: string | null;
}

export interface ChannelQueries {
  getChannelInfo: (query: ChannelIdDTO) => Result<ChannelInfoDTO, AppError>;
}

export interface CreateChannelQueriesOptions {
  cache?: AnalyticsQueryCache;
  cacheTtlMs?: {
    getChannelInfo?: number;
  };
}

const DEFAULT_CHANNEL_INFO_CACHE_TTL_MS = 60_000;

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function validateCachedChannelPayload(payload: unknown): Result<ChannelInfoDTO, AppError> {
  const parsed = ChannelInfoDTOSchema.safeParse(payload);
  if (!parsed.success) {
    return err(
      AppError.create(
        'DB_CHANNEL_CACHE_PAYLOAD_INVALID',
        'Niepoprawny payload cache informacji o kanale.',
        'error',
        { issues: parsed.error.issues },
      ),
    );
  }
  return ok(parsed.data);
}

export function createChannelQueries(
  db: Database.Database,
  options: CreateChannelQueriesOptions = {},
): ChannelQueries {
  const cache = options.cache;
  const channelInfoCacheTtlMs = Math.max(
    1,
    Math.floor(options.cacheTtlMs?.getChannelInfo ?? DEFAULT_CHANNEL_INFO_CACHE_TTL_MS),
  );
  const getChannelInfoStmt = db.prepare<{ channelId: string }, ChannelInfoRow>(
    `
      SELECT
        channel_id AS channelId,
        name,
        description,
        thumbnail_url AS thumbnailUrl,
        subscriber_count AS subscriberCount,
        video_count AS videoCount,
        view_count AS viewCount,
        published_at AS createdAt,
        last_sync_at AS lastSyncAt
      FROM dim_channel
      WHERE channel_id = @channelId
      ORDER BY channel_id ASC
      LIMIT 1
    `,
  );

  return {
    getChannelInfo: (query) => {
      const computeChannelInfo = (): Result<ChannelInfoDTO, AppError> => {
        try {
          const row = getChannelInfoStmt.get({ channelId: query.channelId });
          if (!row) {
            return err(
              AppError.create(
                'DB_CHANNEL_NOT_FOUND',
                'Channel not found.',
                'error',
                { channelId: query.channelId },
              ),
            );
          }

          const parsed = ChannelInfoDTOSchema.safeParse(row);
          if (!parsed.success) {
            return err(
              AppError.create(
                'DB_CHANNEL_INFO_INVALID',
                'Channel data in DB is invalid.',
                'error',
                {
                  channelId: query.channelId,
                  issues: parsed.error.issues,
                },
              ),
            );
          }

          return ok(parsed.data);
        } catch (cause) {
          return err(
            AppError.create(
              'DB_QUERY_CHANNEL_INFO_FAILED',
              'Failed to query channel data.',
              'error',
              { channelId: query.channelId },
              toError(cause),
            ),
          );
        }
      };

      return runWithAnalyticsTrace({
        db,
        operationName: 'channel.getChannelInfo',
        params: {
          channelId: query.channelId,
        },
        lineage: [
          {
            sourceTable: 'dim_channel',
            primaryKeys: ['channel_id'],
            filters: {
              channelId: query.channelId,
            },
          },
        ],
        estimateRowCount: () => 1,
        execute: () =>
          cache
            ? cache.getOrCompute({
                metricId: 'channel.getChannelInfo.v1',
                params: {
                  channelId: query.channelId,
                },
                ttlMs: channelInfoCacheTtlMs,
                execute: () => computeChannelInfo(),
                validate: (payload) => validateCachedChannelPayload(payload),
              })
            : computeChannelInfo(),
      });
    },
  };
}
