import { AppError, createLogger, err, type Logger } from '@moze/shared';
import type { DataProvider } from './data-provider.ts';

type Endpoint = 'getChannelStats' | 'getVideoStats' | 'getRecentVideos';

export interface TokenBucketConfig {
  capacity: number;
  tokensPerSecond: number;
}

export interface CreateRateLimitedDataProviderInput {
  limits?: Partial<Record<Endpoint, TokenBucketConfig>>;
  now?: () => number;
  logger?: Logger;
}

interface BucketState {
  tokens: number;
  lastRefillAt: number;
}

const DEFAULT_LIMITS: Record<Endpoint, TokenBucketConfig> = {
  getChannelStats: { capacity: 20, tokensPerSecond: 10 },
  getVideoStats: { capacity: 20, tokensPerSecond: 10 },
  getRecentVideos: { capacity: 20, tokensPerSecond: 10 },
};

function refillBucket(bucket: BucketState, config: TokenBucketConfig, nowMs: number): void {
  const elapsedMs = Math.max(0, nowMs - bucket.lastRefillAt);
  if (elapsedMs === 0) {
    return;
  }

  const refillTokens = (elapsedMs / 1_000) * config.tokensPerSecond;
  bucket.tokens = Math.min(config.capacity, bucket.tokens + refillTokens);
  bucket.lastRefillAt = nowMs;
}

function createRateLimitError(endpoint: Endpoint, context: Record<string, unknown>): AppError {
  return AppError.create(
    'SYNC_RATE_LIMIT_EXCEEDED',
    'Przekroczono limit zapytan providera.',
    'warning',
    { endpoint, ...context },
  );
}

export function createRateLimitedDataProvider(
  provider: DataProvider,
  input: CreateRateLimitedDataProviderInput = {},
): DataProvider {
  const now = input.now ?? (() => Date.now());
  const logger = input.logger ?? createLogger({ baseContext: { module: 'sync-rate-limiter' } });
  const limits: Record<Endpoint, TokenBucketConfig> = {
    ...DEFAULT_LIMITS,
    ...input.limits,
  };

  const bucketState: Record<Endpoint, BucketState> = {
    getChannelStats: { tokens: limits.getChannelStats.capacity, lastRefillAt: now() },
    getVideoStats: { tokens: limits.getVideoStats.capacity, lastRefillAt: now() },
    getRecentVideos: { tokens: limits.getRecentVideos.capacity, lastRefillAt: now() },
  };

  const consumeToken = (endpoint: Endpoint, query: unknown): AppError | null => {
    const currentTime = now();
    const config = limits[endpoint];
    const bucket = bucketState[endpoint];
    refillBucket(bucket, config, currentTime);

    if (bucket.tokens < 1) {
      const error = createRateLimitError(endpoint, { query, availableTokens: bucket.tokens });
      logger.warning('Rate limit exceeded.', {
        endpoint,
        query,
        availableTokens: bucket.tokens,
      });
      return error;
    }

    bucket.tokens -= 1;
    return null;
  };

  return {
    name: `${provider.name}:rate-limited`,
    configured: provider.configured ?? true,
    requiresAuth: provider.requiresAuth ?? false,
    getChannelStats: (query) => {
      const rateError = consumeToken('getChannelStats', query);
      if (rateError) {
        return err(rateError);
      }
      return provider.getChannelStats(query);
    },
    getVideoStats: (query) => {
      const rateError = consumeToken('getVideoStats', query);
      if (rateError) {
        return err(rateError);
      }
      return provider.getVideoStats(query);
    },
    getRecentVideos: (query) => {
      const rateError = consumeToken('getRecentVideos', query);
      if (rateError) {
        return err(rateError);
      }
      return provider.getRecentVideos(query);
    },
  };
}
