import fs from 'node:fs';
import type Database from 'better-sqlite3';
import { AppError, err, ok, type Result } from '@moze/shared';
import { createCoreRepository } from '../repositories/core-repository.ts';
import type { SeedDatabaseResult, SeedFixture } from './types.ts';

export type { SeedFixture, SeedDatabaseResult } from './types.ts';

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSeedFixture(value: unknown): value is SeedFixture {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.generatedAt !== 'string') {
    return false;
  }

  if (!isRecord(value.profile) || !isRecord(value.channel)) {
    return false;
  }

  if (!Array.isArray(value.videos) || !Array.isArray(value.channelDaily) || !Array.isArray(value.videoDaily)) {
    return false;
  }

  if (value.videos.length !== 50 || value.channelDaily.length !== 90) {
    return false;
  }

  return true;
}

export function loadSeedFixtureFromFile(filePath: string): Result<SeedFixture, AppError> {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);

    if (!isSeedFixture(parsed)) {
      return err(
        AppError.create(
          'DB_FIXTURE_INVALID',
          'Plik fixture ma niepoprawny format.',
          'error',
          { filePath },
        ),
      );
    }

    return ok(parsed);
  } catch (cause) {
    return err(
      AppError.create(
        'DB_FIXTURE_READ_FAILED',
        'Nie udało się odczytać pliku fixture.',
        'error',
        { filePath },
        toError(cause),
      ),
    );
  }
}

export function seedDatabaseFromFixture(
  db: Database.Database,
  fixture: SeedFixture,
): Result<SeedDatabaseResult, AppError> {
  const repository = createCoreRepository(db);

  const profileResult = repository.upsertProfile(fixture.profile);
  if (!profileResult.ok) {
    return profileResult;
  }

  const channelResult = repository.upsertChannel(fixture.channel);
  if (!channelResult.ok) {
    return channelResult;
  }

  const videosResult = repository.upsertVideos(fixture.videos);
  if (!videosResult.ok) {
    return videosResult;
  }

  const channelDaysResult = repository.upsertChannelDays(fixture.channelDaily);
  if (!channelDaysResult.ok) {
    return channelDaysResult;
  }

  const videoDaysResult = repository.upsertVideoDays(fixture.videoDaily);
  if (!videoDaysResult.ok) {
    return videoDaysResult;
  }

  return ok({
    videosInserted: fixture.videos.length,
    channelDaysInserted: fixture.channelDaily.length,
    videoDaysInserted: fixture.videoDaily.length,
  });
}
