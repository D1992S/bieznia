import type { ProviderChannelSnapshot, ProviderVideoSnapshot } from '@moze/data-pipeline';
import type { AppError, Result } from '@moze/shared';

export interface GetChannelStatsInput {
  channelId: string;
}

export interface GetVideoStatsInput {
  videoIds: readonly string[];
}

export interface GetRecentVideosInput {
  channelId: string;
  limit: number;
}

export interface DataProvider {
  readonly name: string;
  readonly configured?: boolean;
  readonly requiresAuth?: boolean;
  getChannelStats: (input: GetChannelStatsInput) => Result<ProviderChannelSnapshot, AppError>;
  getVideoStats: (input: GetVideoStatsInput) => Result<ProviderVideoSnapshot[], AppError>;
  getRecentVideos: (input: GetRecentVideosInput) => Result<ProviderVideoSnapshot[], AppError>;
}
