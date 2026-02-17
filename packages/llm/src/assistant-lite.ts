import { randomUUID } from 'node:crypto';
import {
  createAssistantQueries,
  createAssistantRepository,
  createMetricsQueries,
  type DatabaseConnection,
} from '@moze/core';
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
  const assistantQueries = createAssistantQueries(input.db);
  const assistantRepository = createAssistantRepository(input.db);

  const executeReadChannelInfo = (
    context: ToolExecutionContext,
  ): Result<ToolExecutionOutput, AppError> => {
    try {
      const channelResult = assistantQueries.getChannelInfo({ channelId: context.channelId });
      if (!channelResult.ok) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_READ_CHANNEL_FAILED',
            'Nie udalo sie odczytac informacji o kanale.',
            { channelId: context.channelId, causeErrorCode: channelResult.error.code },
            channelResult.error,
          ),
        );
      }
      const channel = channelResult.value;
      if (!channel) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_CHANNEL_NOT_FOUND',
            'Nie znaleziono kanału dla asystenta.',
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
          'Nie udało się odczytać informacji o kanale.',
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
          'Nie udało się odczytać metryk KPI.',
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
      const topVideosResult = assistantQueries.listTopVideos({
        channelId: context.channelId,
        limit: 3,
      });
      if (!topVideosResult.ok) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_READ_TOP_VIDEOS_FAILED',
            'Nie udalo sie odczytac top filmow.',
            { channelId: context.channelId, causeErrorCode: topVideosResult.error.code },
            topVideosResult.error,
          ),
        );
      }
      const topVideos = topVideosResult.value;

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
          'Nie udało się odczytać top filmów.',
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
      const anomaliesResult = assistantQueries.listAnomalies({
        channelId: context.channelId,
        targetMetric: context.targetMetric,
        dateFrom: context.dateRange.dateFrom,
        dateTo: context.dateRange.dateTo,
        limit: 3,
      });
      if (!anomaliesResult.ok) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_READ_ANOMALIES_FAILED',
            'Nie udalo sie odczytac anomalii.',
            {
              channelId: context.channelId,
              targetMetric: context.targetMetric,
              dateFrom: context.dateRange.dateFrom,
              dateTo: context.dateRange.dateTo,
              causeErrorCode: anomaliesResult.error.code,
            },
            anomaliesResult.error,
          ),
        );
      }
      const anomalies = anomaliesResult.value;

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
          'Nie udało się odczytać anomalii.',
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
      const existingThreadResult = assistantQueries.getThreadById({ threadId });
      if (!existingThreadResult.ok) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_PERSIST_FAILED',
            'Nie udalo sie zapisac rozmowy asystenta.',
            {
              channelId: assistantInput.channelId,
              threadId: assistantInput.threadId ?? null,
              causeErrorCode: existingThreadResult.error.code,
            },
            existingThreadResult.error,
          ),
        );
      }
      const existingThread = existingThreadResult.value;
      if (existingThread && existingThread.channelId !== assistantInput.channelId) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_THREAD_CHANNEL_MISMATCH',
            'Wybrany wątek asystenta nie należy do wskazanego kanału.',
            {
              threadId,
              expectedChannelId: existingThread.channelId,
              requestedChannelId: assistantInput.channelId,
            },
          ),
        );
      }

      const persistResult = assistantRepository.runInTransaction(() => {
        if (!existingThread) {
          const insertThreadResult = assistantRepository.insertThread({
            threadId,
            channelId: assistantInput.channelId,
            title: threadTitle,
            createdAt,
            updatedAt: createdAt,
          });
          if (!insertThreadResult.ok) {
            return insertThreadResult;
          }
        } else {
          const updateThreadResult = assistantRepository.updateThreadTimestamp({
            threadId,
            updatedAt: createdAt,
          });
          if (!updateThreadResult.ok) {
            return updateThreadResult;
          }
        }

        const userMessageInsertResult = assistantRepository.insertMessage({
          threadId,
          role: 'user',
          text: assistantInput.question,
          confidence: null,
          followUpQuestionsJson: '[]',
          createdAt,
        });
        if (!userMessageInsertResult.ok) {
          return userMessageInsertResult;
        }

        const assistantMessageInsertResult = assistantRepository.insertMessage({
          threadId,
          role: 'assistant',
          text: answer,
          confidence,
          followUpQuestionsJson: JSON.stringify(followUpQuestions),
          createdAt,
        });
        if (!assistantMessageInsertResult.ok) {
          return assistantMessageInsertResult;
        }

        const assistantMessageId = assistantMessageInsertResult.value;

        for (const evidenceItem of evidence) {
          const insertEvidenceResult = assistantRepository.insertEvidence({
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
          if (!insertEvidenceResult.ok) {
            return insertEvidenceResult;
          }
        }

        const touchThreadResult = assistantRepository.updateThreadTimestamp({
          threadId,
          updatedAt: createdAt,
        });
        if (!touchThreadResult.ok) {
          return touchThreadResult;
        }

        return ok({
          threadId,
          messageId: assistantMessageId,
          createdAt,
        });
      });

      if (!persistResult.ok) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_PERSIST_FAILED',
            'Nie udalo sie zapisac rozmowy asystenta.',
            {
              channelId: assistantInput.channelId,
              threadId: assistantInput.threadId ?? null,
              causeErrorCode: persistResult.error.code,
            },
            persistResult.error,
          ),
        );
      }
      const persisted = persistResult.value;
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
            'Odpowiedź asystenta ma nieprawidłowy format.',
            { issues: parsed.error.issues },
          ),
        );
      }

      return ok(parsed.data);
    } catch (cause) {
      return err(
        createAssistantError(
          'LLM_ASSISTANT_PERSIST_FAILED',
          'Nie udało się zapisać rozmowy asystenta.',
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
      const rowsResult = assistantQueries.listThreads({
        channelId: listInput.channelId ?? null,
        limit: listInput.limit,
      });
      if (!rowsResult.ok) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_THREADS_READ_FAILED',
            'Nie udalo sie odczytac listy watkow.',
            {
              channelId: listInput.channelId ?? null,
              limit: listInput.limit,
              causeErrorCode: rowsResult.error.code,
            },
            rowsResult.error,
          ),
        );
      }
      const rows = rowsResult.value;

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
            'Lista wątków asystenta ma nieprawidłowy format.',
            { issues: parsed.error.issues },
          ),
        );
      }

      return ok(parsed.data);
    } catch (cause) {
      return err(
        createAssistantError(
          'LLM_ASSISTANT_THREADS_READ_FAILED',
          'Nie udało się odczytać listy wątków.',
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
      const threadResult = assistantQueries.getThreadById({ threadId: threadInput.threadId });
      if (!threadResult.ok) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_THREAD_MESSAGES_READ_FAILED',
            'Nie udalo sie odczytac wiadomosci watku.',
            { threadId: threadInput.threadId, causeErrorCode: threadResult.error.code },
            threadResult.error,
          ),
        );
      }
      const thread = threadResult.value;
      if (!thread) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_THREAD_NOT_FOUND',
            'Nie znaleziono wskazanego wątku asystenta.',
            { threadId: threadInput.threadId },
          ),
        );
      }

      const messageRowsResult = assistantQueries.listMessages({ threadId: threadInput.threadId });
      if (!messageRowsResult.ok) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_THREAD_MESSAGES_READ_FAILED',
            'Nie udalo sie odczytac wiadomosci watku.',
            { threadId: threadInput.threadId, causeErrorCode: messageRowsResult.error.code },
            messageRowsResult.error,
          ),
        );
      }
      const messageRows = messageRowsResult.value;
      const messageIds = messageRows.map((row) => row.messageId);
      const evidenceRowsResult = assistantQueries.listEvidenceForMessages({ messageIds });
      if (!evidenceRowsResult.ok) {
        return err(
          createAssistantError(
            'LLM_ASSISTANT_THREAD_MESSAGES_READ_FAILED',
            'Nie udalo sie odczytac wiadomosci watku.',
            { threadId: threadInput.threadId, causeErrorCode: evidenceRowsResult.error.code },
            evidenceRowsResult.error,
          ),
        );
      }
      const evidenceRows = evidenceRowsResult.value;
      const evidenceByMessageId = new Map<number, AssistantEvidenceItemDTO[]>();
      for (const item of evidenceRows) {
        const evidenceItem: AssistantEvidenceItemDTO = {
          evidenceId: item.evidenceId,
          tool: parseEvidenceTool(item.tool),
          label: item.label,
          value: item.value,
          sourceTable: item.sourceTable,
          sourceRecordId: item.sourceRecordId,
        };
        const grouped = evidenceByMessageId.get(item.messageId);
        if (grouped) {
          grouped.push(evidenceItem);
        } else {
          evidenceByMessageId.set(item.messageId, [evidenceItem]);
        }
      }

      const messages = messageRows.map((row) => {
        return {
          messageId: row.messageId,
          threadId: row.threadId,
          role: row.role,
          text: row.text,
          confidence: row.confidence,
          followUpQuestions: parseJsonStringArray(row.followUpQuestionsJson),
          evidence: evidenceByMessageId.get(row.messageId) ?? [],
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
            'Historia wątku asystenta ma nieprawidłowy format.',
            { threadId: threadInput.threadId, issues: parsed.error.issues },
          ),
        );
      }

      return ok(parsed.data);
    } catch (cause) {
      return err(
        createAssistantError(
          'LLM_ASSISTANT_THREAD_MESSAGES_READ_FAILED',
          'Nie udało się odczytać wiadomości wątku.',
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
