import { saveProviderFixtureToFile, type ProviderChannelSnapshot, type ProviderFixture, type ProviderVideoSnapshot } from '@moze/data-pipeline';
import { AppError, err, ok, type Result } from '@moze/shared';
import type { DataProvider } from './data-provider.ts';

export interface RecordingDataProvider extends DataProvider {
  getLastRecordPath: () => string | null;
}

export interface CreateRecordingDataProviderInput {
  provider: DataProvider;
  outputFilePath: string;
  now?: () => string;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function sortVideos(videos: Iterable<ProviderVideoSnapshot>): ProviderVideoSnapshot[] {
  return [...videos].sort((a, b) => {
    if (a.publishedAt === b.publishedAt) {
      return a.videoId.localeCompare(b.videoId);
    }
    return a.publishedAt > b.publishedAt ? -1 : 1;
  });
}

export function createRecordingDataProvider(input: CreateRecordingDataProviderInput): RecordingDataProvider {
  const now = input.now ?? (() => new Date().toISOString());
  let channelSnapshot: ProviderChannelSnapshot | null = null;
  const videoSnapshots = new Map<string, ProviderVideoSnapshot>();
  let lastRecordPath: string | null = null;

  const persistSnapshot = (): Result<void, AppError> => {
    if (!channelSnapshot || videoSnapshots.size === 0) {
      return ok(undefined);
    }

    const fixture: ProviderFixture = {
      generatedAt: now(),
      channel: channelSnapshot,
      videos: sortVideos(videoSnapshots.values()),
    };

    const saveResult = saveProviderFixtureToFile({
      filePath: input.outputFilePath,
      fixture,
    });

    if (!saveResult.ok) {
      return saveResult;
    }

    lastRecordPath = input.outputFilePath;
    return ok(undefined);
  };

  const mergeVideos = (videos: readonly ProviderVideoSnapshot[]): void => {
    for (const video of videos) {
      videoSnapshots.set(video.videoId, video);
    }
  };

  return {
    name: `${input.provider.name}:recording`,
    configured: input.provider.configured ?? true,
    requiresAuth: input.provider.requiresAuth ?? false,
    getLastRecordPath: () => lastRecordPath,
    getChannelStats: (query) => {
      const result = input.provider.getChannelStats(query);
      if (!result.ok) {
        return result;
      }

      channelSnapshot = result.value;
      const saveResult = persistSnapshot();
      if (!saveResult.ok) {
        return err(
          AppError.create(
            'SYNC_RECORD_SAVE_FAILED',
            'Nie udalo sie zapisac nagrania fake fixture.',
            'error',
            { outputFilePath: input.outputFilePath },
            toError(saveResult.error),
          ),
        );
      }

      return result;
    },
    getVideoStats: (query) => {
      const result = input.provider.getVideoStats(query);
      if (!result.ok) {
        return result;
      }

      mergeVideos(result.value);
      const saveResult = persistSnapshot();
      if (!saveResult.ok) {
        return err(
          AppError.create(
            'SYNC_RECORD_SAVE_FAILED',
            'Nie udalo sie zapisac nagrania fake fixture.',
            'error',
            { outputFilePath: input.outputFilePath },
            toError(saveResult.error),
          ),
        );
      }

      return result;
    },
    getRecentVideos: (query) => {
      const result = input.provider.getRecentVideos(query);
      if (!result.ok) {
        return result;
      }

      mergeVideos(result.value);
      const saveResult = persistSnapshot();
      if (!saveResult.ok) {
        return err(
          AppError.create(
            'SYNC_RECORD_SAVE_FAILED',
            'Nie udalo sie zapisac nagrania fake fixture.',
            'error',
            { outputFilePath: input.outputFilePath },
            toError(saveResult.error),
          ),
        );
      }

      return result;
    },
  };
}
