import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AppError, err, ok } from '@moze/shared';
import { createCachedDataProvider } from './cache-provider.ts';
import { createDataModeManager } from './data-mode-manager.ts';
import type { DataProvider } from './data-provider.ts';
import { createFakeDataProvider } from './fake-provider.ts';
import { createRealDataProvider } from './real-provider.ts';
import { createRecordingDataProvider } from './record-provider.ts';
import { createRateLimitedDataProvider } from './rate-limiter.ts';

const seedFixturePath = fileURLToPath(new URL('../../../fixtures/seed-data.json', import.meta.url));
const channelId = 'UC-SEED-PL-001';

describe('Data modes integration', () => {
  it('switches fake and real mode without changing consumer contract', () => {
    const fakeProviderResult = createFakeDataProvider({ fixturePath: seedFixturePath });
    expect(fakeProviderResult.ok).toBe(true);
    if (!fakeProviderResult.ok) {
      return;
    }

    const realProviderResult = createRealDataProvider({
      fixturePath: seedFixturePath,
      providerName: 'real-fixture-provider',
    });
    expect(realProviderResult.ok).toBe(true);
    if (!realProviderResult.ok) {
      return;
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moze-sync-'));
    const recordingProvider = createRecordingDataProvider({
      provider: realProviderResult.value,
      outputFilePath: path.join(tmpDir, 'latest-provider-recording.json'),
      now: () => '2026-02-12T12:00:00.000Z',
    });

    const manager = createDataModeManager({
      initialMode: 'fake',
      fakeProvider: fakeProviderResult.value,
      realProvider: realProviderResult.value,
      recordProvider: recordingProvider,
    });

    const fakeProbe = manager.probe({
      channelId,
      videoIds: ['VID-001', 'VID-002'],
      recentLimit: 3,
    });
    expect(fakeProbe.ok).toBe(true);
    if (!fakeProbe.ok) {
      return;
    }

    expect(fakeProbe.value.providerName).toBe('fake-data-provider');
    expect(fakeProbe.value.recentVideos).toBe(3);
    expect(fakeProbe.value.videoStats).toBe(2);

    const setModeResult = manager.setMode({ mode: 'real' });
    expect(setModeResult.ok).toBe(true);
    if (!setModeResult.ok) {
      return;
    }

    const realProbe = manager.probe({
      channelId,
      videoIds: ['VID-001', 'VID-002'],
      recentLimit: 3,
    });
    expect(realProbe.ok).toBe(true);
    if (!realProbe.ok) {
      return;
    }

    expect(realProbe.value.providerName).toBe('real-fixture-provider');
    expect(realProbe.value.channelId).toBe(fakeProbe.value.channelId);
    expect(realProbe.value.recentVideos).toBe(fakeProbe.value.recentVideos);
    expect(realProbe.value.videoStats).toBe(fakeProbe.value.videoStats);
  });

  it('creates replayable fixture in record mode', () => {
    const fakeProviderResult = createFakeDataProvider({ fixturePath: seedFixturePath });
    expect(fakeProviderResult.ok).toBe(true);
    if (!fakeProviderResult.ok) {
      return;
    }

    const realProviderResult = createRealDataProvider({ fixturePath: seedFixturePath });
    expect(realProviderResult.ok).toBe(true);
    if (!realProviderResult.ok) {
      return;
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moze-record-'));
    const outputFilePath = path.join(tmpDir, 'latest-provider-recording.json');
    const recordingProvider = createRecordingDataProvider({
      provider: realProviderResult.value,
      outputFilePath,
      now: () => '2026-02-12T13:00:00.000Z',
    });

    const manager = createDataModeManager({
      initialMode: 'record',
      fakeProvider: fakeProviderResult.value,
      realProvider: realProviderResult.value,
      recordProvider: recordingProvider,
    });

    const recordProbe = manager.probe({
      channelId,
      videoIds: ['VID-001', 'VID-002', 'VID-003'],
      recentLimit: 5,
    });

    expect(recordProbe.ok).toBe(true);
    if (!recordProbe.ok) {
      return;
    }

    expect(recordProbe.value.recordFilePath).toBe(outputFilePath);
    expect(fs.existsSync(outputFilePath)).toBe(true);

    const replayProviderResult = createFakeDataProvider({ fixturePath: outputFilePath });
    expect(replayProviderResult.ok).toBe(true);
    if (!replayProviderResult.ok) {
      return;
    }

    const replayChannelResult = replayProviderResult.value.getChannelStats({ channelId });
    expect(replayChannelResult.ok).toBe(true);

    const replayRecentResult = replayProviderResult.value.getRecentVideos({ channelId, limit: 3 });
    expect(replayRecentResult.ok).toBe(true);
    if (!replayRecentResult.ok) {
      return;
    }

    expect(replayRecentResult.value.length).toBe(3);
  });

  it('blocks excess calls with token bucket rate limiter', () => {
    const fakeProviderResult = createFakeDataProvider({ fixturePath: seedFixturePath });
    expect(fakeProviderResult.ok).toBe(true);
    if (!fakeProviderResult.ok) {
      return;
    }

    const rateLimitedProvider = createRateLimitedDataProvider(fakeProviderResult.value, {
      limits: {
        getChannelStats: { capacity: 1, tokensPerSecond: 0 },
      },
      now: () => 0,
    });

    const first = rateLimitedProvider.getChannelStats({ channelId });
    expect(first.ok).toBe(true);

    const second = rateLimitedProvider.getChannelStats({ channelId });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('SYNC_RATE_LIMIT_EXCEEDED');
    }
  });

  it('returns cached response inside TTL window', () => {
    let callCount = 0;
    let nowMs = 0;

    const baseProvider: DataProvider = {
      name: 'cache-test-provider',
      getChannelStats: () => {
        callCount += 1;
        return ok({
          channelId: 'UC-CACHE-001',
          name: 'Cache Test',
          description: 'Cache test provider',
          thumbnailUrl: null,
          subscriberCount: 100,
          videoCount: 10,
          viewCount: callCount,
          createdAt: '2020-01-01T00:00:00.000Z',
          lastSyncAt: null,
        });
      },
      getVideoStats: () => ok([]),
      getRecentVideos: () => ok([]),
    };

    const cachedProvider = createCachedDataProvider(baseProvider, {
      ttlMsByEndpoint: { getChannelStats: 1_000 },
      now: () => nowMs,
    });

    const first = cachedProvider.getChannelStats({ channelId: 'UC-CACHE-001' });
    const second = cachedProvider.getChannelStats({ channelId: 'UC-CACHE-001' });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(callCount).toBe(1);

    nowMs = 2_000;
    const third = cachedProvider.getChannelStats({ channelId: 'UC-CACHE-001' });
    expect(third.ok).toBe(true);
    expect(callCount).toBe(2);
  });

  it('hides unavailable real mode and falls back to available initial mode', () => {
    const fakeProviderResult = createFakeDataProvider({ fixturePath: seedFixturePath });
    expect(fakeProviderResult.ok).toBe(true);
    if (!fakeProviderResult.ok) {
      return;
    }

    const realProviderResult = createRealDataProvider({
      providerName: 'real-provider-unconfigured',
    });
    expect(realProviderResult.ok).toBe(true);
    if (!realProviderResult.ok) {
      return;
    }

    const recordingProvider = createRecordingDataProvider({
      provider: fakeProviderResult.value,
      outputFilePath: path.join(os.tmpdir(), `mode-record-${Date.now()}.json`),
    });

    const manager = createDataModeManager({
      initialMode: 'real',
      fakeProvider: fakeProviderResult.value,
      realProvider: realProviderResult.value,
      recordProvider: recordingProvider,
      source: 'availability-test',
    });

    const status = manager.getStatus();
    expect(status.mode).toBe('fake');
    expect(status.availableModes).toContain('fake');
    expect(status.availableModes).toContain('record');
    expect(status.availableModes).not.toContain('real');

    const setRealResult = manager.setMode({ mode: 'real' });
    expect(setRealResult.ok).toBe(false);
    if (!setRealResult.ok) {
      expect(setRealResult.error.code).toBe('SYNC_MODE_UNAVAILABLE');
    }
  });

  it('keeps real mode unavailable until auth guard allows activation', () => {
    const fakeProviderResult = createFakeDataProvider({ fixturePath: seedFixturePath });
    expect(fakeProviderResult.ok).toBe(true);
    if (!fakeProviderResult.ok) {
      return;
    }

    const realProviderResult = createRealDataProvider({
      fixturePath: seedFixturePath,
      providerName: 'real-fixture-provider',
      requiresAuth: true,
    });
    expect(realProviderResult.ok).toBe(true);
    if (!realProviderResult.ok) {
      return;
    }

    const recordingProvider = createRecordingDataProvider({
      provider: realProviderResult.value,
      outputFilePath: path.join(os.tmpdir(), `mode-auth-record-${Date.now()}.json`),
    });

    let authConnected = false;
    const manager = createDataModeManager({
      initialMode: 'fake',
      fakeProvider: fakeProviderResult.value,
      realProvider: realProviderResult.value,
      recordProvider: recordingProvider,
      source: 'auth-guard-test',
      canActivateMode: ({ mode, provider }) => {
        if (mode === 'real' && provider.requiresAuth === true && !authConnected) {
          return err(
            AppError.create(
              'SYNC_REAL_AUTH_REQUIRED',
              'Tryb real wymaga podlaczonego konta.',
              'error',
              {},
            ),
          );
        }
        return ok(undefined);
      },
    });

    const blockedStatus = manager.getStatus();
    expect(blockedStatus.availableModes).not.toContain('real');

    const blockedSetResult = manager.setMode({ mode: 'real' });
    expect(blockedSetResult.ok).toBe(false);
    if (!blockedSetResult.ok) {
      expect(blockedSetResult.error.code).toBe('SYNC_REAL_AUTH_REQUIRED');
    }

    authConnected = true;
    const allowedStatus = manager.getStatus();
    expect(allowedStatus.availableModes).toContain('real');

    const allowedSetResult = manager.setMode({ mode: 'real' });
    expect(allowedSetResult.ok).toBe(true);
    if (allowedSetResult.ok) {
      expect(allowedSetResult.value.mode).toBe('real');
    }
  });
});
