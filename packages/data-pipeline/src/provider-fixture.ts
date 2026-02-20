import fs from 'node:fs';
import path from 'node:path';
import { loadSeedFixtureFromFile, type SeedFixture } from '@moze/core';
import { AppError, err, ok, type Result } from '@moze/shared';
import { z } from 'zod/v4';

export const ProviderChannelSnapshotSchema = z.object({
  channelId: z.string(),
  name: z.string(),
  description: z.string(),
  thumbnailUrl: z.string().nullable(),
  subscriberCount: z.number(),
  videoCount: z.number(),
  viewCount: z.number(),
  createdAt: z.iso.datetime(),
  lastSyncAt: z.iso.datetime().nullable(),
});

export type ProviderChannelSnapshot = z.infer<typeof ProviderChannelSnapshotSchema>;

export const ProviderVideoSnapshotSchema = z.object({
  videoId: z.string(),
  channelId: z.string(),
  title: z.string(),
  description: z.string(),
  thumbnailUrl: z.string().nullable(),
  publishedAt: z.iso.datetime(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  viewCount: z.number().int().nonnegative(),
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
});

export type ProviderVideoSnapshot = z.infer<typeof ProviderVideoSnapshotSchema>;

export const ProviderFixtureSchema = z.object({
  generatedAt: z.iso.datetime(),
  channel: ProviderChannelSnapshotSchema,
  videos: z.array(ProviderVideoSnapshotSchema).min(1),
});

export type ProviderFixture = z.infer<typeof ProviderFixtureSchema>;

export interface SaveProviderFixtureInput {
  filePath: string;
  fixture: ProviderFixture;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function mapSeedFixture(seed: SeedFixture): ProviderFixture {
  return {
    generatedAt: seed.generatedAt,
    channel: {
      channelId: seed.channel.channelId,
      name: seed.channel.name,
      description: seed.channel.description,
      thumbnailUrl: seed.channel.thumbnailUrl ?? null,
      subscriberCount: seed.channel.subscriberCount,
      videoCount: seed.channel.videoCount,
      viewCount: seed.channel.viewCount,
      createdAt: seed.channel.publishedAt,
      lastSyncAt: seed.channel.lastSyncAt ?? null,
    },
    videos: seed.videos.map((video) => ({
      videoId: video.videoId,
      channelId: video.channelId,
      title: video.title,
      description: video.description,
      thumbnailUrl: video.thumbnailUrl ?? null,
      publishedAt: video.publishedAt,
      durationSeconds: video.durationSeconds ?? null,
      viewCount: video.viewCount,
      likeCount: video.likeCount,
      commentCount: video.commentCount,
    })),
  };
}

export function loadProviderFixtureFromFile(filePath: string): Result<ProviderFixture, AppError> {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsedJson: unknown = JSON.parse(raw);
    const parsedFixture = ProviderFixtureSchema.safeParse(parsedJson);
    if (parsedFixture.success) {
      return ok(parsedFixture.data);
    }
  } catch {
    // Ignore and try core seed loader as fallback below.
  }

  const seedFallback = loadSeedFixtureFromFile(filePath);
  if (seedFallback.ok) {
    return ok(mapSeedFixture(seedFallback.value));
  }

  return err(
    AppError.create(
      'PIPELINE_FIXTURE_LOAD_FAILED',
      'Nie udalo sie odczytac fixture providera.',
      'error',
      { filePath, seedError: seedFallback.error.toDTO() },
    ),
  );
}

export function saveProviderFixtureToFile(input: SaveProviderFixtureInput): Result<void, AppError> {
  const parsedFixture = ProviderFixtureSchema.safeParse(input.fixture);
  if (!parsedFixture.success) {
    return err(
      AppError.create(
        'PIPELINE_FIXTURE_INVALID',
        'Fixture providera ma niepoprawny format.',
        'error',
        { filePath: input.filePath, issues: parsedFixture.error.issues },
      ),
    );
  }

  try {
    fs.mkdirSync(path.dirname(input.filePath), { recursive: true });
    fs.writeFileSync(input.filePath, JSON.stringify(parsedFixture.data, null, 2), 'utf8');
    return ok(undefined);
  } catch (cause) {
    return err(
      AppError.create(
        'PIPELINE_FIXTURE_SAVE_FAILED',
        'Nie udalo sie zapisac fixture providera.',
        'error',
        { filePath: input.filePath },
        toError(cause),
      ),
    );
  }
}
