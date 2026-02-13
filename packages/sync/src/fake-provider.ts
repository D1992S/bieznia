import { loadProviderFixtureFromFile } from '@moze/data-pipeline';
import { AppError, err, ok, type Result } from '@moze/shared';
import type { DataProvider } from './data-provider.ts';

export interface CreateFakeDataProviderInput {
  fixturePath: string;
}

function createNotFoundError(context: Record<string, unknown>): AppError {
  return AppError.create(
    'SYNC_FAKE_DATA_NOT_FOUND',
    'Brak danych w fake provider dla podanego zapytania.',
    'error',
    context,
  );
}

export function createFakeDataProvider(input: CreateFakeDataProviderInput): Result<DataProvider, AppError> {
  const fixtureResult = loadProviderFixtureFromFile(input.fixturePath);
  if (!fixtureResult.ok) {
    return fixtureResult;
  }

  const videosById = new Map<string, (typeof fixtureResult.value.videos)[number]>();
  for (const video of fixtureResult.value.videos) {
    videosById.set(video.videoId, video);
  }

  const provider: DataProvider = {
    name: 'fake-data-provider',
    configured: true,
    requiresAuth: false,
    getChannelStats: (query) => {
      if (query.channelId !== fixtureResult.value.channel.channelId) {
        return err(
          createNotFoundError({
            fixturePath: input.fixturePath,
            channelId: query.channelId,
          }),
        );
      }

      return ok(fixtureResult.value.channel);
    },
    getVideoStats: (query) => {
      const videos = query.videoIds
        .map((videoId) => videosById.get(videoId))
        .filter((video): video is NonNullable<typeof video> => Boolean(video));

      if (videos.length === 0) {
        return err(
          createNotFoundError({
            fixturePath: input.fixturePath,
            videoIds: query.videoIds,
          }),
        );
      }

      return ok(videos);
    },
    getRecentVideos: (query) => {
      if (query.channelId !== fixtureResult.value.channel.channelId) {
        return err(
          createNotFoundError({
            fixturePath: input.fixturePath,
            channelId: query.channelId,
          }),
        );
      }

      const sorted = [...fixtureResult.value.videos].sort((a, b) => {
        if (a.publishedAt === b.publishedAt) {
          return a.videoId.localeCompare(b.videoId);
        }
        return a.publishedAt > b.publishedAt ? -1 : 1;
      });

      return ok(sorted.slice(0, query.limit));
    },
  };

  return ok(provider);
}
