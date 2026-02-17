import { randomUUID } from 'node:crypto';
import { createMetricsQueries, type DatabaseConnection } from '@moze/core';
import {
  AppError,
  AssistantAskResultDTOSchema,
  AssistantThreadListResultDTOSchema,
  AssistantThreadMessagesResultDTOSchema,
  err,
  ok,
  type AssistantAskInputDTO,
  type AssistantAskResultDTO,
  type AssistantConfidence,
  type AssistantEvidenceItemDTO,
  type AssistantThreadListInputDTO,
  type AssistantThreadListResultDTO,
  type AssistantThreadMessagesInputDTO,
  type AssistantThreadMessagesResultDTO,
  type AssistantToolName,
  type MlTargetMetric,
  type Result,
} from '@moze/shared';

interface ChannelInfoRow {
  channelId: string;
  name: string;
  subscriberCount: number;
  videoCount: number;
}

interface TopVideoRow {
  videoId: string;
  title: string;
  viewCount: number;
  publishedAt: string;
}

interface AnomalyRow {
  anomalyId: number;
  date: string;
  value: number;
  baseline: number;
  severity: string;
  explanation: string;
}

interface ThreadRow {
  threadId: string;
  channelId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface ThreadListRow {
  threadId: string;
  channelId: string;
  title: string;
  lastQuestion: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MessageRow {
  messageId: number;
  threadId: string;
  role: 'user' | 'assistant';
  text: string;
  confidence: AssistantConfidence | null;
  followUpQuestionsJson: string;
  createdAt: string;
}

interface MessageEvidenceRow {
  evidenceId: string;
  tool: AssistantToolName;
  label: string;
  value: string;
  sourceTable: string;
  sourceRecordId: string;
}

interface DateRange {
  dateFrom: string;
  dateTo: string;
}

interface ToolExecutionContext {
  channelId: string;
  dateRange: DateRange;
  targetMetric: MlTargetMetric;
}

interface ToolExecutionOutput {
  summaryLines: string[];
  evidence: AssistantEvidenceItemDTO[];
}

interface AssistantLiteServiceInput {
  db: DatabaseConnection['db'];
  mode?: 'local-stub';
  now?: () => Date;
}

export interface AssistantLiteService {
  ask: (input: AssistantAskInputDTO) => Result<AssistantAskResultDTO, AppError>;
  listThreads: (input: AssistantThreadListInputDTO) => Result<AssistantThreadListResultDTO, AppError>;
  getThreadMessages: (
    input: AssistantThreadMessagesInputDTO,
  ) => Result<AssistantThreadMessagesResultDTO, AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toIsoDateTime(value: Date): string {
  return value.toISOString();
}

function buildDefaultDateRange(now: Date): DateRange {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);

  return {
    dateFrom: toIsoDate(start),
    dateTo: toIsoDate(end),
  };
}

function resolveDateRange(input: AssistantAskInputDTO, now: Date): DateRange {
  if (input.dateFrom && input.dateTo) {
    return {
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    };
  }

  return buildDefaultDateRange(now);
}

function normalizeQuestionText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function truncateThreadTitle(question: string): string {
  const normalized = question.trim();
  if (normalized.length <= 96) {
    return normalized;
  }
  return `${normalized.slice(0, 93)}...`;
}

function toNumber(value: number | bigint): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return value;
}

function formatInt(value: number): string {
  return new Intl.NumberFormat('pl-PL').format(Math.round(value));
}

function parseJsonStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const result: string[] = [];
    for (const item of parsed) {
      if (typeof item === 'string' && item.trim().length > 0) {
        result.push(item);
      }
    }
    return result;
  } catch {
    return [];
  }
}

function parseEvidenceTool(value: string): AssistantToolName {
  if (value === 'read_channel_info') {
    return value;
  }
  if (value === 'read_kpis') {
    return value;
  }
  if (value === 'read_top_videos') {
    return value;
  }
  return 'read_anomalies';
}

function selectWhitelistedTools(question: string): AssistantToolName[] {
  const normalizedQuestion = normalizeQuestionText(question);
  const selected = new Set<AssistantToolName>(['read_channel_info', 'read_kpis']);

  if (/(film|video|wideo|top|najleps|najsilniejs)/.test(normalizedQuestion)) {
    selected.add('read_top_videos');
  }

  if (/(anomali|spad|skok|ryzyk|trend)/.test(normalizedQuestion)) {
    selected.add('read_anomalies');
  }

  return Array.from(selected.values());
}

function calculateConfidence(evidenceCount: number): AssistantConfidence {
  if (evidenceCount >= 5) {
    return 'high';
  }
  if (evidenceCount >= 3) {
    return 'medium';
  }
  return 'low';
}

function buildFollowUpQuestions(selectedTools: readonly AssistantToolName[]): string[] {
  const followUpQuestions: string[] = [
    'Czy chcesz porownanie z poprzednim okresem?',
    'Czy mam rozbic wyniki dzien po dniu?',
  ];

  if (selectedTools.includes('read_top_videos')) {
    followUpQuestions.push('Czy pokazac top 5 filmow z najwieksza liczba wyswietlen?');
  }

  if (selectedTools.includes('read_anomalies')) {
    followUpQuestions.push('Czy opisac wykryte anomalie wraz z potencjalna przyczyna?');
  }

  return followUpQuestions.slice(0, 4);
}

function createAssistantError(
  code: string,
  message: string,
  context: Record<string, unknown>,
  cause?: unknown,
): AppError {
  return AppError.create(code, message, 'error', context, cause ? toError(cause) : undefined);
}

export function createAssistantLiteService(input: AssistantLiteServiceInput): AssistantLiteService {
  const nowProvider = input.now ?? (() => new Date());
  const metricsQueries = createMetricsQueries(input.db);

  const readChannelInfoStmt = input.db.prepare<{ channelId: string }, ChannelInfoRow>(
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

  const readTopVideosStmt = input.db.prepare<{ channelId: string; limit: number }, TopVideoRow>(
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

  const readAnomaliesStmt = input.db.prepare<{
    channelId: string;
    targetMetric: MlTargetMetric;
    dateFrom: string;
    dateTo: string;
    limit: number;
  }, AnomalyRow>(
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

  const readThreadStmt = input.db.prepare<{ threadId: string }, ThreadRow>(
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

  const insertThreadStmt = input.db.prepare<{
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

  const updateThreadStmt = input.db.prepare<{
    threadId: string;
    updatedAt: string;
  }>(
    `
      UPDATE assistant_threads
      SET updated_at = @updatedAt
      WHERE thread_id = @threadId
    `,
  );

  const insertMessageStmt = input.db.prepare<{
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

  const insertEvidenceStmt = input.db.prepare<{
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

  const listThreadsStmt = input.db.prepare<{ channelId: string | null; limit: number }, ThreadListRow>(
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

  const listMessagesStmt = input.db.prepare<{ threadId: string }, MessageRow>(
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

  const listEvidenceStmt = input.db.prepare<{ messageId: number }, MessageEvidenceRow>(
    `
      SELECT
        evidence_id AS evidenceId,
        tool_name AS tool,
        label,
        value,
        source_table AS sourceTable,
        source_record_id AS sourceRecordId
      FROM assistant_message_evidence
      WHERE message_id = @messageId
      ORDER BY id ASC
    `,
  );

  const executeReadChannelInfo = (
    context: ToolExecutionContext,
  ): Result<ToolExecutionOutput, AppError> => {
    try {
      const channel = readChannelInfoStmt.get({ channelId: context.channelId });
      if (!channel) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_CHANNEL_NOT_FOUND',
            'Assistant channel lookup failed because channel does not exist.',
            { channelId: context.channelId },
          ),
        );
      }

      return ok({
        summaryLines: [
          `Kanal ${channel.name} ma ${formatInt(channel.subscriberCount)} subskrybentow i ${formatInt(channel.videoCount)} filmow.`,
        ],
        evidence: [
          {
            evidenceId: `ev-channel-${channel.channelId}`,
            tool: 'read_channel_info',
            label: 'Podstawowe dane kanalu',
            value: `Subskrybenci: ${formatInt(channel.subscriberCount)}, filmy: ${formatInt(channel.videoCount)}`,
            sourceTable: 'dim_channel',
            sourceRecordId: `channel_id=${channel.channelId}`,
          },
        ],
      });
    } catch (cause) {
      return err(
        createAssistantError(
          'LLM_ASSISTANT_READ_CHANNEL_FAILED',
          'Assistant failed to read channel info.',
          { channelId: context.channelId },
          cause,
        ),
      );
    }
  };

  const executeReadKpis = (
    context: ToolExecutionContext,
  ): Result<ToolExecutionOutput, AppError> => {
    const kpiResult = metricsQueries.getKpis({
      channelId: context.channelId,
      dateFrom: context.dateRange.dateFrom,
      dateTo: context.dateRange.dateTo,
    });

    if (!kpiResult.ok) {
      return err(
        createAssistantError(
          'LLM_ASSISTANT_READ_KPIS_FAILED',
          'Assistant failed to read KPI metrics.',
          {
            channelId: context.channelId,
            dateFrom: context.dateRange.dateFrom,
            dateTo: context.dateRange.dateTo,
            causeErrorCode: kpiResult.error.code,
          },
        ),
      );
    }

    const sourceRecordId = `channel_id=${context.channelId};date=${context.dateRange.dateFrom}..${context.dateRange.dateTo}`;
    return ok({
      summaryLines: [
        `W analizowanym okresie kanal zebral ${formatInt(kpiResult.value.views)} wyswietlen (delta ${formatInt(kpiResult.value.viewsDelta)}).`,
        `Aktualna liczba subskrybentow to ${formatInt(kpiResult.value.subscribers)} (delta ${formatInt(kpiResult.value.subscribersDelta)}).`,
      ],
      evidence: [
        {
          evidenceId: `ev-kpis-views-${context.dateRange.dateFrom}-${context.dateRange.dateTo}`,
          tool: 'read_kpis',
          label: 'Suma wyswietlen',
          value: String(kpiResult.value.views),
          sourceTable: 'fact_channel_day',
          sourceRecordId,
        },
        {
          evidenceId: `ev-kpis-subs-${context.dateRange.dateFrom}-${context.dateRange.dateTo}`,
          tool: 'read_kpis',
          label: 'Liczba subskrybentow',
          value: String(kpiResult.value.subscribers),
          sourceTable: 'fact_channel_day',
          sourceRecordId,
        },
        {
          evidenceId: `ev-kpis-engagement-${context.dateRange.dateFrom}-${context.dateRange.dateTo}`,
          tool: 'read_kpis',
          label: 'Engagement rate',
          value: kpiResult.value.engagementRate.toFixed(4),
          sourceTable: 'fact_channel_day',
          sourceRecordId,
        },
      ],
    });
  };

  const executeReadTopVideos = (
    context: ToolExecutionContext,
  ): Result<ToolExecutionOutput, AppError> => {
    try {
      const topVideos = readTopVideosStmt.all({
        channelId: context.channelId,
        limit: 3,
      });

      if (topVideos.length === 0) {
        return ok({
          summaryLines: ['Brak filmow w bazie dla wybranego kanalu.'],
          evidence: [],
        });
      }

      const strongestVideo = topVideos[0];
      const strongestVideoSentence = strongestVideo
        ? `Najmocniejszy film: "${strongestVideo.title}" (${formatInt(strongestVideo.viewCount)} wyswietlen).`
        : 'Brak danych o najmocniejszym filmie.';

      const evidence: AssistantEvidenceItemDTO[] = topVideos.map((video) => ({
        evidenceId: `ev-video-${video.videoId}`,
        tool: 'read_top_videos',
        label: `Film ${video.videoId}`,
        value: `${video.title} (${formatInt(video.viewCount)} wyswietlen)`,
        sourceTable: 'dim_video',
        sourceRecordId: `video_id=${video.videoId}`,
      }));

      return ok({
        summaryLines: [strongestVideoSentence],
        evidence,
      });
    } catch (cause) {
      return err(
        createAssistantError(
          'LLM_ASSISTANT_READ_TOP_VIDEOS_FAILED',
          'Assistant failed to read top videos.',
          { channelId: context.channelId },
          cause,
        ),
      );
    }
  };

  const executeReadAnomalies = (
    context: ToolExecutionContext,
  ): Result<ToolExecutionOutput, AppError> => {
    try {
      const anomalies = readAnomaliesStmt.all({
        channelId: context.channelId,
        targetMetric: context.targetMetric,
        dateFrom: context.dateRange.dateFrom,
        dateTo: context.dateRange.dateTo,
        limit: 3,
      });

      if (anomalies.length === 0) {
        return ok({
          summaryLines: ['W wybranym okresie nie wykryto zapisanych anomalii.'],
          evidence: [],
        });
      }

      const evidence: AssistantEvidenceItemDTO[] = anomalies.map((anomaly) => ({
        evidenceId: `ev-anomaly-${String(anomaly.anomalyId)}`,
        tool: 'read_anomalies',
        label: `Anomalia ${anomaly.date}`,
        value: `${formatInt(anomaly.value)} vs baseline ${formatInt(anomaly.baseline)} (${anomaly.severity})`,
        sourceTable: 'ml_anomalies',
        sourceRecordId: `id=${String(anomaly.anomalyId)}`,
      }));

      const firstAnomaly = anomalies[0];
      const summaryLine = firstAnomaly
        ? `Wykryto ${String(anomalies.length)} anomalii; najnowsza: ${firstAnomaly.date} (${firstAnomaly.severity}).`
        : 'Wykryto anomalie.';

      return ok({
        summaryLines: [summaryLine],
        evidence,
      });
    } catch (cause) {
      return err(
        createAssistantError(
          'LLM_ASSISTANT_READ_ANOMALIES_FAILED',
          'Assistant failed to read anomalies.',
          {
            channelId: context.channelId,
            targetMetric: context.targetMetric,
            dateFrom: context.dateRange.dateFrom,
            dateTo: context.dateRange.dateTo,
          },
          cause,
        ),
      );
    }
  };

  const executeTool = (
    toolName: AssistantToolName,
    context: ToolExecutionContext,
  ): Result<ToolExecutionOutput, AppError> => {
    if (toolName === 'read_channel_info') {
      return executeReadChannelInfo(context);
    }
    if (toolName === 'read_kpis') {
      return executeReadKpis(context);
    }
    if (toolName === 'read_top_videos') {
      return executeReadTopVideos(context);
    }
    return executeReadAnomalies(context);
  };

  const ask = (assistantInput: AssistantAskInputDTO): Result<AssistantAskResultDTO, AppError> => {
    const now = nowProvider();
    const dateRange = resolveDateRange(assistantInput, now);
    const selectedTools = selectWhitelistedTools(assistantInput.question);

    const summaries: string[] = [];
    const evidence: AssistantEvidenceItemDTO[] = [];

    for (const toolName of selectedTools) {
      const toolResult = executeTool(toolName, {
        channelId: assistantInput.channelId,
        dateRange,
        targetMetric: assistantInput.targetMetric,
      });
      if (!toolResult.ok) {
        return toolResult;
      }

      summaries.push(...toolResult.value.summaryLines);
      evidence.push(...toolResult.value.evidence);
    }

    const confidence = calculateConfidence(evidence.length);
    const followUpQuestions = buildFollowUpQuestions(selectedTools);
    const answerPrefix = `Na podstawie danych z bazy (zakres ${dateRange.dateFrom} - ${dateRange.dateTo})`;
    const answerBody = summaries.length > 0
      ? summaries.join(' ')
      : 'Nie znaleziono danych do odpowiedzi na to pytanie.';
    const answer = `${answerPrefix}: ${answerBody}`;

    try {
      const createdAt = toIsoDateTime(now);
      const threadId = assistantInput.threadId && assistantInput.threadId.trim().length > 0
        ? assistantInput.threadId.trim()
        : randomUUID();
      const threadTitle = truncateThreadTitle(assistantInput.question);
      const existingThread = readThreadStmt.get({ threadId });
      if (existingThread && existingThread.channelId !== assistantInput.channelId) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_THREAD_CHANNEL_MISMATCH',
            'Assistant thread does not belong to requested channel.',
            {
              threadId,
              expectedChannelId: existingThread.channelId,
              requestedChannelId: assistantInput.channelId,
            },
          ),
        );
      }

      const persistTransaction = input.db.transaction(() => {
        if (!existingThread) {
          insertThreadStmt.run({
            threadId,
            channelId: assistantInput.channelId,
            title: threadTitle,
            createdAt,
            updatedAt: createdAt,
          });
        } else {
          updateThreadStmt.run({
            threadId,
            updatedAt: createdAt,
          });
        }

        insertMessageStmt.run({
          threadId,
          role: 'user',
          text: assistantInput.question,
          confidence: null,
          followUpQuestionsJson: '[]',
          createdAt,
        });

        const assistantMessageInsert = insertMessageStmt.run({
          threadId,
          role: 'assistant',
          text: answer,
          confidence,
          followUpQuestionsJson: JSON.stringify(followUpQuestions),
          createdAt,
        });

        const assistantMessageId = toNumber(assistantMessageInsert.lastInsertRowid);

        for (const evidenceItem of evidence) {
          insertEvidenceStmt.run({
            messageId: assistantMessageId,
            evidenceId: evidenceItem.evidenceId,
            toolName: evidenceItem.tool,
            label: evidenceItem.label,
            value: evidenceItem.value,
            sourceTable: evidenceItem.sourceTable,
            sourceRecordId: evidenceItem.sourceRecordId,
            metadataJson: '{}',
            createdAt,
          });
        }

        updateThreadStmt.run({
          threadId,
          updatedAt: createdAt,
        });

        return {
          threadId,
          messageId: assistantMessageId,
          createdAt,
        };
      });

      const persisted = persistTransaction();
      const resultPayload: AssistantAskResultDTO = {
        threadId: persisted.threadId,
        messageId: persisted.messageId,
        answer,
        confidence,
        followUpQuestions,
        evidence,
        usedStub: true,
        createdAt: persisted.createdAt,
      };

      const parsed = AssistantAskResultDTOSchema.safeParse(resultPayload);
      if (!parsed.success) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_OUTPUT_INVALID',
            'Assistant response payload is invalid.',
            { issues: parsed.error.issues },
          ),
        );
      }

      return ok(parsed.data);
    } catch (cause) {
      return err(
        createAssistantError(
          'LLM_ASSISTANT_PERSIST_FAILED',
          'Assistant failed to persist conversation.',
          {
            channelId: assistantInput.channelId,
            threadId: assistantInput.threadId ?? null,
          },
          cause,
        ),
      );
    }
  };

  const listThreads = (
    listInput: AssistantThreadListInputDTO,
  ): Result<AssistantThreadListResultDTO, AppError> => {
    try {
      const rows = listThreadsStmt.all({
        channelId: listInput.channelId ?? null,
        limit: listInput.limit,
      });

      const payload: AssistantThreadListResultDTO = {
        items: rows.map((row) => ({
          threadId: row.threadId,
          channelId: row.channelId,
          title: row.title,
          lastQuestion: row.lastQuestion,
          updatedAt: row.updatedAt,
          createdAt: row.createdAt,
        })),
      };

      const parsed = AssistantThreadListResultDTOSchema.safeParse(payload);
      if (!parsed.success) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_THREADS_INVALID',
            'Assistant threads payload is invalid.',
            { issues: parsed.error.issues },
          ),
        );
      }

      return ok(parsed.data);
    } catch (cause) {
      return err(
        createAssistantError(
          'LLM_ASSISTANT_THREADS_READ_FAILED',
          'Assistant failed to read thread list.',
          {
            channelId: listInput.channelId ?? null,
            limit: listInput.limit,
          },
          cause,
        ),
      );
    }
  };

  const getThreadMessages = (
    threadInput: AssistantThreadMessagesInputDTO,
  ): Result<AssistantThreadMessagesResultDTO, AppError> => {
    try {
      const thread = readThreadStmt.get({ threadId: threadInput.threadId });
      if (!thread) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_THREAD_NOT_FOUND',
            'Assistant thread does not exist.',
            { threadId: threadInput.threadId },
          ),
        );
      }

      const messageRows = listMessagesStmt.all({ threadId: threadInput.threadId });
      const messages = messageRows.map((row) => {
        const evidenceRows = listEvidenceStmt.all({ messageId: row.messageId });
        const evidence: AssistantEvidenceItemDTO[] = evidenceRows.map((item) => ({
          evidenceId: item.evidenceId,
          tool: parseEvidenceTool(item.tool),
          label: item.label,
          value: item.value,
          sourceTable: item.sourceTable,
          sourceRecordId: item.sourceRecordId,
        }));

        return {
          messageId: row.messageId,
          threadId: row.threadId,
          role: row.role,
          text: row.text,
          confidence: row.confidence,
          followUpQuestions: parseJsonStringArray(row.followUpQuestionsJson),
          evidence,
          createdAt: row.createdAt,
        };
      });

      const payload: AssistantThreadMessagesResultDTO = {
        threadId: thread.threadId,
        channelId: thread.channelId,
        title: thread.title,
        messages,
      };

      const parsed = AssistantThreadMessagesResultDTOSchema.safeParse(payload);
      if (!parsed.success) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_THREAD_MESSAGES_INVALID',
            'Assistant thread history payload is invalid.',
            { threadId: threadInput.threadId, issues: parsed.error.issues },
          ),
        );
      }

      return ok(parsed.data);
    } catch (cause) {
      return err(
        createAssistantError(
          'LLM_ASSISTANT_THREAD_MESSAGES_READ_FAILED',
          'Assistant failed to read thread messages.',
          { threadId: threadInput.threadId },
          cause,
        ),
      );
    }
  };

  return {
    ask,
    listThreads,
    getThreadMessages,
  };
}
