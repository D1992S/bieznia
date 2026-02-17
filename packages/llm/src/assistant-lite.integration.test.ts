import { fileURLToPath } from 'node:url';
import {
  createDatabaseConnection,
  loadSeedFixtureFromFile,
  runMigrations,
  seedDatabaseFromFixture,
} from '@moze/core';
import { describe, expect, it } from 'vitest';
import { createAssistantLiteService } from './assistant-lite.ts';

const fixturePath = fileURLToPath(new URL('../../../fixtures/seed-data.json', import.meta.url));

interface TestContext {
  channelId: string;
  dateFrom: string;
  dateTo: string;
  close: () => void;
  service: ReturnType<typeof createAssistantLiteService>;
}

function createTestContext(): TestContext {
  const connectionResult = createDatabaseConnection();
  expect(connectionResult.ok).toBe(true);
  if (!connectionResult.ok) {
    throw new Error(connectionResult.error.message);
  }

  const migrationResult = runMigrations(connectionResult.value.db);
  expect(migrationResult.ok).toBe(true);
  if (!migrationResult.ok) {
    throw new Error(migrationResult.error.message);
  }

  const fixtureResult = loadSeedFixtureFromFile(fixturePath);
  expect(fixtureResult.ok).toBe(true);
  if (!fixtureResult.ok) {
    throw new Error(fixtureResult.error.message);
  }

  const seedResult = seedDatabaseFromFixture(connectionResult.value.db, fixtureResult.value);
  expect(seedResult.ok).toBe(true);
  if (!seedResult.ok) {
    throw new Error(seedResult.error.message);
  }

  const dateTo = fixtureResult.value.channelDaily[fixtureResult.value.channelDaily.length - 1]?.date ?? '2026-02-15';
  const dateFrom = fixtureResult.value.channelDaily[fixtureResult.value.channelDaily.length - 30]?.date ?? dateTo;
  const channelId = fixtureResult.value.channel.channelId;

  const service = createAssistantLiteService({
    db: connectionResult.value.db,
    mode: 'local-stub',
    now: () => new Date('2026-02-16T10:00:00.000Z'),
  });

  return {
    channelId,
    dateFrom,
    dateTo,
    service,
    close: () => {
      const closeResult = connectionResult.value.close();
      expect(closeResult.ok).toBe(true);
    },
  };
}

describe('Assistant Lite integration', () => {
  it('answers using whitelisted read-only tools and persists thread history with evidence', () => {
    const ctx = createTestContext();

    const askResult = ctx.service.ask({
      channelId: ctx.channelId,
      question: 'Jak szly moje filmy w ostatnim miesiacu?',
      dateFrom: ctx.dateFrom,
      dateTo: ctx.dateTo,
      targetMetric: 'views',
    });

    expect(askResult.ok).toBe(true);
    if (!askResult.ok) {
      return;
    }

    expect(askResult.value.answer.length).toBeGreaterThan(20);
    expect(askResult.value.evidence.length).toBeGreaterThan(0);
    expect(askResult.value.usedStub).toBe(true);

    const threadListResult = ctx.service.listThreads({
      channelId: ctx.channelId,
      limit: 20,
    });
    expect(threadListResult.ok).toBe(true);
    if (!threadListResult.ok) {
      return;
    }
    expect(threadListResult.value.items.length).toBe(1);

    const threadMessagesResult = ctx.service.getThreadMessages({
      threadId: askResult.value.threadId,
    });
    expect(threadMessagesResult.ok).toBe(true);
    if (!threadMessagesResult.ok) {
      return;
    }

    expect(threadMessagesResult.value.messages.length).toBe(2);
    expect(threadMessagesResult.value.messages[0]?.role).toBe('user');
    expect(threadMessagesResult.value.messages[1]?.role).toBe('assistant');
    expect(threadMessagesResult.value.messages[1]?.evidence.length).toBeGreaterThan(0);

    const secondAskResult = ctx.service.ask({
      threadId: askResult.value.threadId,
      channelId: ctx.channelId,
      question: 'Pokaz mi anomalie i ryzyka dla tego okresu.',
      dateFrom: ctx.dateFrom,
      dateTo: ctx.dateTo,
      targetMetric: 'views',
    });

    expect(secondAskResult.ok).toBe(true);
    if (!secondAskResult.ok) {
      return;
    }

    const threadMessagesAfterSecondAsk = ctx.service.getThreadMessages({
      threadId: askResult.value.threadId,
    });
    expect(threadMessagesAfterSecondAsk.ok).toBe(true);
    if (!threadMessagesAfterSecondAsk.ok) {
      return;
    }

    expect(threadMessagesAfterSecondAsk.value.messages.length).toBe(4);

    ctx.close();
  });

  it('returns deterministic local-stub output for same input on fresh databases', () => {
    const first = createTestContext();
    const second = createTestContext();

    const firstResult = first.service.ask({
      channelId: first.channelId,
      question: 'Jak szly moje filmy w ostatnim miesiacu?',
      dateFrom: first.dateFrom,
      dateTo: first.dateTo,
      targetMetric: 'views',
    });
    const secondResult = second.service.ask({
      channelId: second.channelId,
      question: 'Jak szly moje filmy w ostatnim miesiacu?',
      dateFrom: second.dateFrom,
      dateTo: second.dateTo,
      targetMetric: 'views',
    });

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    if (!firstResult.ok || !secondResult.ok) {
      return;
    }

    expect(firstResult.value.answer).toBe(secondResult.value.answer);
    expect(firstResult.value.confidence).toBe(secondResult.value.confidence);
    expect(firstResult.value.followUpQuestions).toEqual(secondResult.value.followUpQuestions);
    expect(firstResult.value.evidence.map((item) => item.value)).toEqual(
      secondResult.value.evidence.map((item) => item.value),
    );

    first.close();
    second.close();
  });
});
