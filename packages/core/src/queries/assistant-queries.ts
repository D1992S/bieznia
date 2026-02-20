import type Database from 'better-sqlite3';
import { AppError, err, ok, type AssistantConfidence, type AssistantToolName, type MlTargetMetric, type Result } from '@moze/shared';

export interface AssistantChannelInfoRow {
  channelId: string;
  name: string;
  subscriberCount: number;
  videoCount: number;
}

export interface AssistantTopVideoRow {
  videoId: string;
  title: string;
  viewCount: number;
  publishedAt: string;
}

export interface AssistantAnomalyRow {
  anomalyId: number;
  date: string;
  value: number;
  baseline: number;
  severity: string;
  explanation: string;
}

export interface AssistantThreadRow {
  threadId: string;
  channelId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantThreadListRow {
  threadId: string;
  channelId: string;
  title: string;
  lastQuestion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantMessageRow {
  messageId: number;
  threadId: string;
  role: 'user' | 'assistant';
  text: string;
  confidence: AssistantConfidence | null;
  followUpQuestionsJson: string;
  createdAt: string;
}

export interface AssistantMessageEvidenceBatchRow {
  messageId: number;
  evidenceId: string;
  tool: AssistantToolName;
  label: string;
  value: string;
  sourceTable: string;
  sourceRecordId: string;
}

export interface AssistantQueries {
  getChannelInfo: (input: { channelId: string }) => Result<AssistantChannelInfoRow | null, AppError>;
  listTopVideos: (input: { channelId: string; limit: number }) => Result<AssistantTopVideoRow[], AppError>;
  listAnomalies: (input: {
    channelId: string;
    targetMetric: MlTargetMetric;
    dateFrom: string;
    dateTo: string;
    limit: number;
  }) => Result<AssistantAnomalyRow[], AppError>;
  getThreadById: (input: { threadId: string }) => Result<AssistantThreadRow | null, AppError>;
  listThreads: (input: { channelId: string | null; limit: number }) => Result<AssistantThreadListRow[], AppError>;
  listMessages: (input: { threadId: string }) => Result<AssistantMessageRow[], AppError>;
  listEvidenceForMessages: (input: {
    messageIds: readonly number[];
  }) => Result<AssistantMessageEvidenceBatchRow[], AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

export function createAssistantQueries(db: Database.Database): AssistantQueries {
  const getChannelInfoStmt = db.prepare<{ channelId: string }, AssistantChannelInfoRow>(
    `
      SELECT
        channel_id AS channelId,
        name,
        subscriber_count AS subscriberCount,
        video_count AS videoCount
      FROM dim_channel
      WHERE channel_id = @channelId
      ORDER BY channel_id ASC
      LIMIT 1
    `,
  );

  const listTopVideosStmt = db.prepare<{ channelId: string; limit: number }, AssistantTopVideoRow>(
    `
      SELECT
        video_id AS videoId,
        title,
        view_count AS viewCount,
        published_at AS publishedAt
      FROM dim_video
      WHERE channel_id = @channelId
      ORDER BY view_count DESC, published_at DESC, video_id ASC
      LIMIT @limit
    `,
  );

  const listAnomaliesStmt = db.prepare<{
    channelId: string;
    targetMetric: MlTargetMetric;
    dateFrom: string;
    dateTo: string;
    limit: number;
  }, AssistantAnomalyRow>(
    `
      SELECT
        id AS anomalyId,
        date,
        metric_value AS value,
        baseline_value AS baseline,
        severity,
        explanation
      FROM ml_anomalies
      WHERE channel_id = @channelId
        AND target_metric = @targetMetric
        AND date >= @dateFrom
        AND date <= @dateTo
      ORDER BY date DESC, id DESC
      LIMIT @limit
    `,
  );

  const getThreadStmt = db.prepare<{ threadId: string }, AssistantThreadRow>(
    `
      SELECT
        thread_id AS threadId,
        channel_id AS channelId,
        title,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM assistant_threads
      WHERE thread_id = @threadId
      ORDER BY thread_id ASC
      LIMIT 1
    `,
  );

  const listThreadsStmt = db.prepare<{ channelId: string | null; limit: number }, AssistantThreadListRow>(
    `
      SELECT
        t.thread_id AS threadId,
        t.channel_id AS channelId,
        t.title AS title,
        (
          SELECT m.text
          FROM assistant_messages m
          WHERE m.thread_id = t.thread_id
            AND m.role = 'user'
          ORDER BY m.id DESC
          LIMIT 1
        ) AS lastQuestion,
        t.created_at AS createdAt,
        t.updated_at AS updatedAt
      FROM assistant_threads t
      WHERE (@channelId IS NULL OR t.channel_id = @channelId)
      ORDER BY t.updated_at DESC, t.thread_id ASC
      LIMIT @limit
    `,
  );

  const listMessagesStmt = db.prepare<{ threadId: string }, AssistantMessageRow>(
    `
      SELECT
        id AS messageId,
        thread_id AS threadId,
        role,
        text,
        confidence,
        follow_up_questions_json AS followUpQuestionsJson,
        created_at AS createdAt
      FROM assistant_messages
      WHERE thread_id = @threadId
      ORDER BY id ASC
    `,
  );

  return {
    getChannelInfo: (input) => {
      try {
        return ok(getChannelInfoStmt.get({ channelId: input.channelId }) ?? null);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ASSISTANT_CHANNEL_READ_FAILED',
            'Nie udalo sie odczytac danych kanalu dla asystenta.',
            'error',
            { channelId: input.channelId },
            toError(cause),
          ),
        );
      }
    },

    listTopVideos: (input) => {
      try {
        return ok(listTopVideosStmt.all({ channelId: input.channelId, limit: input.limit }));
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ASSISTANT_TOP_VIDEOS_READ_FAILED',
            'Nie udalo sie odczytac top filmow dla asystenta.',
            'error',
            { channelId: input.channelId, limit: input.limit },
            toError(cause),
          ),
        );
      }
    },

    listAnomalies: (input) => {
      try {
        return ok(
          listAnomaliesStmt.all({
            channelId: input.channelId,
            targetMetric: input.targetMetric,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            limit: input.limit,
          }),
        );
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ASSISTANT_ANOMALIES_READ_FAILED',
            'Nie udalo sie odczytac anomalii dla asystenta.',
            'error',
            {
              channelId: input.channelId,
              targetMetric: input.targetMetric,
              dateFrom: input.dateFrom,
              dateTo: input.dateTo,
              limit: input.limit,
            },
            toError(cause),
          ),
        );
      }
    },

    getThreadById: (input) => {
      try {
        return ok(getThreadStmt.get({ threadId: input.threadId }) ?? null);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ASSISTANT_THREAD_READ_FAILED',
            'Nie udalo sie odczytac watku asystenta.',
            'error',
            { threadId: input.threadId },
            toError(cause),
          ),
        );
      }
    },

    listThreads: (input) => {
      try {
        return ok(listThreadsStmt.all({ channelId: input.channelId, limit: input.limit }));
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ASSISTANT_THREADS_READ_FAILED',
            'Nie udalo sie odczytac listy watkow asystenta.',
            'error',
            { channelId: input.channelId, limit: input.limit },
            toError(cause),
          ),
        );
      }
    },

    listMessages: (input) => {
      try {
        return ok(listMessagesStmt.all({ threadId: input.threadId }));
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ASSISTANT_MESSAGES_READ_FAILED',
            'Nie udalo sie odczytac wiadomosci asystenta.',
            'error',
            { threadId: input.threadId },
            toError(cause),
          ),
        );
      }
    },

    listEvidenceForMessages: (input) => {
      if (input.messageIds.length === 0) {
        return ok([]);
      }

      try {
        const placeholders = input.messageIds
          .map((_, index) => `@messageId${String(index)}`)
          .join(', ');
        const statement = db.prepare<Record<string, number>, AssistantMessageEvidenceBatchRow>(
          `
            SELECT
              message_id AS messageId,
              evidence_id AS evidenceId,
              tool_name AS tool,
              label,
              value,
              source_table AS sourceTable,
              source_record_id AS sourceRecordId
            FROM assistant_message_evidence
            WHERE message_id IN (${placeholders})
            ORDER BY message_id ASC, id ASC
          `,
        );

        const parameters: Record<string, number> = {};
        for (const [index, messageId] of input.messageIds.entries()) {
          parameters[`messageId${String(index)}`] = messageId;
        }

        return ok(statement.all(parameters));
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ASSISTANT_EVIDENCE_READ_FAILED',
            'Nie udalo sie odczytac dowodow asystenta.',
            'error',
            { messageIds: input.messageIds.length },
            toError(cause),
          ),
        );
      }
    },
  };
}
