import { ok } from '@moze/shared';
import type { DataProvider } from './data-provider.ts';

type Endpoint = 'getChannelStats' | 'getVideoStats' | 'getRecentVideos';
type ChannelStatsResult = ReturnType<DataProvider['getChannelStats']>;
type VideoStatsResult = ReturnType<DataProvider['getVideoStats']>;
type RecentVideosResult = ReturnType<DataProvider['getRecentVideos']>;

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export interface CreateCachedDataProviderInput {
  ttlMsByEndpoint?: Partial<Record<Endpoint, number>>;
  now?: () => number;
}

const DEFAULT_TTL_MS: Record<Endpoint, number> = {
  getChannelStats: 10_000,
  getVideoStats: 10_000,
  getRecentVideos: 10_000,
};

function getCacheKey(input: unknown): string {
  return JSON.stringify(input);
}

function readCacheEntry<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  now: () => number,
): T | null {
  const cached = cache.get(key);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt < now()) {
    cache.delete(key);
    return null;
  }

  return cached.value;
}

function writeCacheEntry<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
  now: () => number,
): void {
  if (ttlMs <= 0) {
    return;
  }

  cache.set(key, {
    expiresAt: now() + ttlMs,
    value,
  });
}

export function createCachedDataProvider(
  provider: DataProvider,
  input: CreateCachedDataProviderInput = {},
): DataProvider {
  const now = input.now ?? (() => Date.now());
  const ttlByEndpoint: Record<Endpoint, number> = {
    ...DEFAULT_TTL_MS,
    ...input.ttlMsByEndpoint,
  };

  const channelStatsCache = new Map<string, CacheEntry<ChannelStatsResult>>();
  const videoStatsCache = new Map<string, CacheEntry<VideoStatsResult>>();
  const recentVideosCache = new Map<string, CacheEntry<RecentVideosResult>>();

  return {
    name: `${provider.name}:cached`,
    configured: provider.configured ?? true,
    requiresAuth: provider.requiresAuth ?? false,
    getChannelStats: (query) => {
      const key = getCacheKey(query);
      const cached = readCacheEntry(channelStatsCache, key, now);
      if (cached) {
        return cached;
      }

      const result = provider.getChannelStats(query);
      if (result.ok) {
        writeCacheEntry(channelStatsCache, key, ok(result.value), ttlByEndpoint.getChannelStats, now);
      }
      return result;
    },
    getVideoStats: (query) => {
      const key = getCacheKey(query);
      const cached = readCacheEntry(videoStatsCache, key, now);
      if (cached) {
        return cached;
      }

      const result = provider.getVideoStats(query);
      if (result.ok) {
        writeCacheEntry(videoStatsCache, key, ok(result.value), ttlByEndpoint.getVideoStats, now);
      }
      return result;
    },
    getRecentVideos: (query) => {
      const key = getCacheKey(query);
      const cached = readCacheEntry(recentVideosCache, key, now);
      if (cached) {
        return cached;
      }

      const result = provider.getRecentVideos(query);
      if (result.ok) {
        writeCacheEntry(recentVideosCache, key, ok(result.value), ttlByEndpoint.getRecentVideos, now);
      }
      return result;
    },
  };
}
