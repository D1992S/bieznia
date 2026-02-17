import type Database from 'better-sqlite3';
import { AppError, err, ok, type AssistantConfidence, type AssistantToolName, type Result } from '@moze/shared';

export interface AssistantRepository {
  insertThread: (input: {
    threadId: string;
    channelId: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  }) => Result<void, AppError>;
  updateThreadTimestamp: (input: { threadId: string; updatedAt: string }) => Result<void, AppError>;
  insertMessage: (input: {
    threadId: string;
    role: 'user' | 'assistant';
    text: string;
    confidence: AssistantConfidence | null;
    followUpQuestionsJson: string;
    createdAt: string;
  }) => Result<number, AppError>;
  insertEvidence: (input: {
    messageId: number;
    evidenceId: string;
    toolName: AssistantToolName;
    label: string;
    value: string;
    sourceTable: string;
    sourceRecordId: string;
    metadataJson: string;
    createdAt: string;
  }) => Result<void, AppError>;
  runInTransaction: <T>(operation: () => Result<T, AppError>) => Result<T, AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function toNumberId(value: number | bigint): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return value;
}

export function createAssistantRepository(db: Database.Database): AssistantRepository {
  const insertThreadStmt = db.prepare<{
    threadId: string;
    channelId: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  }>(
    `
      INSERT INTO assistant_threads (
        thread_id,
        channel_id,
        title,
        created_at,
        updated_at
      )
      VALUES (
        @threadId,
        @channelId,
        @title,
        @createdAt,
        @updatedAt
      )
    `,
  );

  const updateThreadStmt = db.prepare<{
    threadId: string;
    updatedAt: string;
  }>(
    `
      UPDATE assistant_threads
      SET updated_at = @updatedAt
      WHERE thread_id = @threadId
    `,
  );

  const insertMessageStmt = db.prepare<{
    threadId: string;
    role: 'user' | 'assistant';
    text: string;
    confidence: AssistantConfidence | null;
    followUpQuestionsJson: string;
    createdAt: string;
  }>(
    `
      INSERT INTO assistant_messages (
        thread_id,
        role,
        text,
        confidence,
        follow_up_questions_json,
        created_at
      )
      VALUES (
        @threadId,
        @role,
        @text,
        @confidence,
        @followUpQuestionsJson,
        @createdAt
      )
    `,
  );

  const insertEvidenceStmt = db.prepare<{
    messageId: number;
    evidenceId: string;
    toolName: AssistantToolName;
    label: string;
    value: string;
    sourceTable: string;
    sourceRecordId: string;
    metadataJson: string;
    createdAt: string;
  }>(
    `
      INSERT INTO assistant_message_evidence (
        message_id,
        evidence_id,
        tool_name,
        label,
        value,
        source_table,
        source_record_id,
        metadata_json,
        created_at
      )
      VALUES (
        @messageId,
        @evidenceId,
        @toolName,
        @label,
        @value,
        @sourceTable,
        @sourceRecordId,
        @metadataJson,
        @createdAt
      )
    `,
  );

  return {
    insertThread: (input) => {
      try {
        insertThreadStmt.run({
          threadId: input.threadId,
          channelId: input.channelId,
          title: input.title,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ASSISTANT_THREAD_INSERT_FAILED',
            'Nie udalo sie zapisac watku asystenta.',
            'error',
            { threadId: input.threadId, channelId: input.channelId },
            toError(cause),
          ),
        );
      }
    },

    updateThreadTimestamp: (input) => {
      try {
        updateThreadStmt.run({
          threadId: input.threadId,
          updatedAt: input.updatedAt,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ASSISTANT_THREAD_UPDATE_FAILED',
            'Nie udalo sie zaktualizowac watku asystenta.',
            'error',
            { threadId: input.threadId },
            toError(cause),
          ),
        );
      }
    },

    insertMessage: (input) => {
      try {
        const result = insertMessageStmt.run({
          threadId: input.threadId,
          role: input.role,
          text: input.text,
          confidence: input.confidence,
          followUpQuestionsJson: input.followUpQuestionsJson,
          createdAt: input.createdAt,
        });
        return ok(toNumberId(result.lastInsertRowid));
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ASSISTANT_MESSAGE_INSERT_FAILED',
            'Nie udalo sie zapisac wiadomosci asystenta.',
            'error',
            { threadId: input.threadId, role: input.role },
            toError(cause),
          ),
        );
      }
    },

    insertEvidence: (input) => {
      try {
        insertEvidenceStmt.run({
          messageId: input.messageId,
          evidenceId: input.evidenceId,
          toolName: input.toolName,
          label: input.label,
          value: input.value,
          sourceTable: input.sourceTable,
          sourceRecordId: input.sourceRecordId,
          metadataJson: input.metadataJson,
          createdAt: input.createdAt,
        });
        return ok(undefined);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ASSISTANT_EVIDENCE_INSERT_FAILED',
            'Nie udalo sie zapisac dowodu asystenta.',
            'error',
            { messageId: input.messageId, evidenceId: input.evidenceId },
            toError(cause),
          ),
        );
      }
    },

    runInTransaction: <T>(operation: () => Result<T, AppError>) => {
      try {
        const transaction = db.transaction(() => operation());
        return transaction();
      } catch (cause) {
        return err(
          AppError.create(
            'DB_ASSISTANT_TRANSACTION_FAILED',
            'Nie udalo sie wykonac transakcji asystenta.',
            'error',
            {},
            toError(cause),
          ),
        );
      }
    },
  };
}
