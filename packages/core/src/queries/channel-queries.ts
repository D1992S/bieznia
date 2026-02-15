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

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

export function createChannelQueries(db: Database.Database): ChannelQueries {
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
    getChannelInfo: (query) =>
      runWithAnalyticsTrace({
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
        execute: () => {
          try {
            const row = getChannelInfoStmt.get({ channelId: query.channelId });
            if (!row) {
              return err(
                AppError.create(
                  'DB_CHANNEL_NOT_FOUND',
                  'Nie znaleziono kana³u o podanym identyfikatorze.',
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
                  'Dane kana³u w bazie s¹ niepoprawne.',
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
                'Nie uda³o siê pobraæ danych kana³u.',
                'error',
                { channelId: query.channelId },
                toError(cause),
              ),
            );
          }
        },
      }),
  };
}