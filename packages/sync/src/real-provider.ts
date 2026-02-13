import { AppError, err, ok, type Result } from '@moze/shared';
import type { ProviderChannelSnapshot, ProviderVideoSnapshot } from '@moze/data-pipeline';
import type { DataProvider, GetChannelStatsInput, GetRecentVideosInput, GetVideoStatsInput } from './data-provider.ts';
import { createFakeDataProvider } from './fake-provider.ts';

export interface RealProviderAdapter {
  getChannelStats: (input: GetChannelStatsInput) => Result<ProviderChannelSnapshot, AppError>;
  getVideoStats: (input: GetVideoStatsInput) => Result<ProviderVideoSnapshot[], AppError>;
  getRecentVideos: (input: GetRecentVideosInput) => Result<ProviderVideoSnapshot[], AppError>;
}

export interface CreateRealDataProviderInput {
  adapter?: RealProviderAdapter;
  fixturePath?: string;
  providerName?: string;
  requiresAuth?: boolean;
}

function createNotConfiguredError(context: Record<string, unknown>): AppError {
  return AppError.create(
    'SYNC_REAL_PROVIDER_NOT_CONFIGURED',
    'Provider real mode nie jest skonfigurowany.',
    'error',
    context,
  );
}

export function createRealDataProvider(input: CreateRealDataProviderInput = {}): Result<DataProvider, AppError> {
  const adapter = input.adapter;
  if (adapter) {
    return ok({
      name: input.providerName ?? 'real-adapter-provider',
      configured: true,
      requiresAuth: input.requiresAuth ?? true,
      getChannelStats: (query) => adapter.getChannelStats(query),
      getVideoStats: (query) => adapter.getVideoStats(query),
      getRecentVideos: (query) => adapter.getRecentVideos(query),
    });
  }

  if (input.fixturePath) {
    const fakeProviderResult = createFakeDataProvider({ fixturePath: input.fixturePath });
    if (!fakeProviderResult.ok) {
      return fakeProviderResult;
    }

    return ok({
      name: input.providerName ?? 'real-fixture-provider',
      configured: true,
      requiresAuth: input.requiresAuth ?? false,
      getChannelStats: (query) => fakeProviderResult.value.getChannelStats(query),
      getVideoStats: (query) => fakeProviderResult.value.getVideoStats(query),
      getRecentVideos: (query) => fakeProviderResult.value.getRecentVideos(query),
    });
  }

  return ok({
    name: input.providerName ?? 'real-provider-unconfigured',
    configured: false,
    requiresAuth: true,
    getChannelStats: (query) => err(createNotConfiguredError({ endpoint: 'getChannelStats', query })),
    getVideoStats: (query) => err(createNotConfiguredError({ endpoint: 'getVideoStats', query })),
    getRecentVideos: (query) => err(createNotConfiguredError({ endpoint: 'getRecentVideos', query })),
  });
}
