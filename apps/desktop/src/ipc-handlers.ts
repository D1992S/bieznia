import {
  AppError,
  DataModeProbeInputDTOSchema,
  DataModeProbeResultDTOSchema,
  DataModeProbeResultSchema,
  DataModeStatusDTOSchema,
  DataModeStatusResultSchema,
  AppStatusDTOSchema,
  AppStatusResultSchema,
  ChannelIdDTOSchema,
  ChannelInfoDTOSchema,
  ChannelInfoResultSchema,
  AuthConnectInputDTOSchema,
  AuthStatusDTOSchema,
  AuthStatusResultSchema,
  CsvImportPreviewInputDTOSchema,
  CsvImportPreviewResultDTOSchema,
  CsvImportPreviewResultSchema,
  CsvImportRunInputDTOSchema,
  CsvImportRunResultDTOSchema,
  CsvImportRunResultSchema,
  EmptyPayloadSchema,
  IPC_CHANNELS,
  KpiQueryDTOSchema,
  KpiResultDTOSchema,
  KpiResultSchema,
  MlAnomalyListResultDTOSchema,
  MlAnomalyListResultSchema,
  MlAnomalyQueryInputDTOSchema,
  MlDetectAnomaliesInputDTOSchema,
  MlDetectAnomaliesResultDTOSchema,
  MlDetectAnomaliesResultSchema,
  MlForecastQueryInputDTOSchema,
  MlForecastResultDTOSchema,
  MlForecastResultSchema,
  MlRunBaselineInputDTOSchema,
  MlRunBaselineResultDTOSchema,
  MlRunBaselineResultSchema,
  MlTrendQueryInputDTOSchema,
  MlTrendResultDTOSchema,
  MlTrendResultSchema,
  QualityScoreQueryInputDTOSchema,
  QualityScoreResultDTOSchema,
  QualityScoreResultSchema,
  CompetitorSyncInputDTOSchema,
  CompetitorSyncResultDTOSchema,
  CompetitorSyncResultSchema,
  CompetitorInsightsQueryInputDTOSchema,
  CompetitorInsightsResultDTOSchema,
  CompetitorInsightsResultSchema,
  TopicIntelligenceRunInputDTOSchema,
  TopicIntelligenceQueryInputDTOSchema,
  TopicIntelligenceResultDTOSchema,
  TopicIntelligenceResultSchema,
  PlanningGenerateInputDTOSchema,
  PlanningGetPlanInputDTOSchema,
  PlanningPlanResultDTOSchema,
  PlanningPlanResultSchema,
  ProfileCreateInputDTOSchema,
  ProfileListResultDTOSchema,
  ProfileListResultSchema,
  ProfileSetActiveInputDTOSchema,
  ProfileSettingsDTOSchema,
  ProfileSettingsResultSchema,
  ReportExportInputDTOSchema,
  ReportExportResultDTOSchema,
  ReportExportResultSchema,
  ReportGenerateInputDTOSchema,
  ReportGenerateResultDTOSchema,
  ReportGenerateResultSchema,
  SettingsUpdateInputDTOSchema,
  SearchContentInputDTOSchema,
  SearchContentResultDTOSchema,
  SearchContentResultSchema,
  AssistantAskInputDTOSchema,
  AssistantAskResultDTOSchema,
  AssistantAskResultSchema,
  AssistantThreadListInputDTOSchema,
  AssistantThreadListResultDTOSchema,
  AssistantThreadListResultSchema,
  AssistantThreadMessagesInputDTOSchema,
  AssistantThreadMessagesResultDTOSchema,
  AssistantThreadMessagesResultSchema,
  SyncCommandResultDTOSchema,
  SyncCommandResultSchema,
  SyncResumeInputDTOSchema,
  SyncStartInputDTOSchema,
  SetDataModeInputDTOSchema,
  TimeseriesQueryDTOSchema,
  TimeseriesResultDTOSchema,
  TimeseriesResultSchema,
  type DataModeProbeInputDTO,
  type DataModeProbeResult,
  type DataModeProbeResultDTO,
  type DataModeStatusDTO,
  type DataModeStatusResult,
  type SetDataModeInputDTO,
  type AppStatusDTO,
  type AppStatusResult,
  type AuthConnectInputDTO,
  type AuthStatusDTO,
  type AuthStatusResult,
  type CsvImportPreviewInputDTO,
  type CsvImportPreviewResult,
  type CsvImportPreviewResultDTO,
  type CsvImportRunInputDTO,
  type CsvImportRunResult,
  type CsvImportRunResultDTO,
  type ChannelInfoDTO,
  type ChannelInfoResult,
  type IpcResult,
  type KpiQueryDTO,
  type KpiResult,
  type KpiResultDTO,
  type MlAnomalyListResult,
  type MlAnomalyListResultDTO,
  type MlAnomalyQueryInputDTO,
  type MlDetectAnomaliesInputDTO,
  type MlDetectAnomaliesResult,
  type MlDetectAnomaliesResultDTO,
  type MlForecastQueryInputDTO,
  type MlForecastResult,
  type MlForecastResultDTO,
  type MlRunBaselineInputDTO,
  type MlRunBaselineResult,
  type MlRunBaselineResultDTO,
  type MlTrendQueryInputDTO,
  type MlTrendResult,
  type MlTrendResultDTO,
  type QualityScoreQueryInputDTO,
  type QualityScoreResult,
  type QualityScoreResultDTO,
  type CompetitorSyncInputDTO,
  type CompetitorSyncResult,
  type CompetitorSyncResultDTO,
  type CompetitorInsightsQueryInputDTO,
  type CompetitorInsightsResult,
  type CompetitorInsightsResultDTO,
  type TopicIntelligenceRunInputDTO,
  type TopicIntelligenceQueryInputDTO,
  type TopicIntelligenceResult,
  type TopicIntelligenceResultDTO,
  type PlanningGenerateInputDTO,
  type PlanningGetPlanInputDTO,
  type PlanningPlanResult,
  type PlanningPlanResultDTO,
  type ProfileCreateInputDTO,
  type ProfileListResult,
  type ProfileListResultDTO,
  type ProfileSetActiveInputDTO,
  type ProfileSettingsDTO,
  type ProfileSettingsResult,
  type ReportExportInputDTO,
  type ReportExportResult,
  type ReportExportResultDTO,
  type ReportGenerateInputDTO,
  type ReportGenerateResult,
  type ReportGenerateResultDTO,
  type Result,
  type SyncCommandResult,
  type SyncCommandResultDTO,
  type SyncResumeInputDTO,
  type SyncStartInputDTO,
  type SettingsUpdateInputDTO,
  type SearchContentInputDTO,
  type SearchContentResult,
  type SearchContentResultDTO,
  type AssistantAskInputDTO,
  type AssistantAskResult,
  type AssistantAskResultDTO,
  type AssistantThreadListInputDTO,
  type AssistantThreadListResult,
  type AssistantThreadListResultDTO,
  type AssistantThreadMessagesInputDTO,
  type AssistantThreadMessagesResult,
  type AssistantThreadMessagesResultDTO,
  type TimeseriesQueryDTO,
  type TimeseriesResult,
  type TimeseriesResultDTO,
} from '@moze/shared';
import type { z } from 'zod/v4';

export interface DesktopIpcBackend {
  getAppStatus: () => Result<AppStatusDTO, AppError>;
  getDataModeStatus: () => Result<DataModeStatusDTO, AppError>;
  setDataMode: (input: SetDataModeInputDTO) => Result<DataModeStatusDTO, AppError>;
  probeDataMode: (input: DataModeProbeInputDTO) => Result<DataModeProbeResultDTO, AppError>;
  listProfiles: () => Result<ProfileListResultDTO, AppError>;
  createProfile: (input: ProfileCreateInputDTO) => Result<ProfileListResultDTO, AppError>;
  setActiveProfile: (input: ProfileSetActiveInputDTO) => Result<ProfileListResultDTO, AppError>;
  getProfileSettings: () => Result<ProfileSettingsDTO, AppError>;
  updateProfileSettings: (input: SettingsUpdateInputDTO) => Result<ProfileSettingsDTO, AppError>;
  getAuthStatus: () => Result<AuthStatusDTO, AppError>;
  connectAuth: (input: AuthConnectInputDTO) => Result<AuthStatusDTO, AppError>;
  disconnectAuth: () => Result<AuthStatusDTO, AppError>;
  previewCsvImport: (input: CsvImportPreviewInputDTO) => Result<CsvImportPreviewResultDTO, AppError>;
  runCsvImport: (input: CsvImportRunInputDTO) => Result<CsvImportRunResultDTO, AppError> | Promise<Result<CsvImportRunResultDTO, AppError>>;
  searchContent: (input: SearchContentInputDTO) => Result<SearchContentResultDTO, AppError>;
  startSync: (input: SyncStartInputDTO) => Result<SyncCommandResultDTO, AppError> | Promise<Result<SyncCommandResultDTO, AppError>>;
  resumeSync: (input: SyncResumeInputDTO) => Result<SyncCommandResultDTO, AppError> | Promise<Result<SyncCommandResultDTO, AppError>>;
  runMlBaseline: (input: MlRunBaselineInputDTO) => Result<MlRunBaselineResultDTO, AppError> | Promise<Result<MlRunBaselineResultDTO, AppError>>;
  getMlForecast: (input: MlForecastQueryInputDTO) => Result<MlForecastResultDTO, AppError> | Promise<Result<MlForecastResultDTO, AppError>>;
  detectMlAnomalies: (input: MlDetectAnomaliesInputDTO) => Result<MlDetectAnomaliesResultDTO, AppError> | Promise<Result<MlDetectAnomaliesResultDTO, AppError>>;
  getMlAnomalies: (input: MlAnomalyQueryInputDTO) => Result<MlAnomalyListResultDTO, AppError> | Promise<Result<MlAnomalyListResultDTO, AppError>>;
  getMlTrend: (input: MlTrendQueryInputDTO) => Result<MlTrendResultDTO, AppError> | Promise<Result<MlTrendResultDTO, AppError>>;
  getQualityScores: (input: QualityScoreQueryInputDTO) => Result<QualityScoreResultDTO, AppError> | Promise<Result<QualityScoreResultDTO, AppError>>;
  syncCompetitors: (input: CompetitorSyncInputDTO) => Result<CompetitorSyncResultDTO, AppError> | Promise<Result<CompetitorSyncResultDTO, AppError>>;
  getCompetitorInsights: (input: CompetitorInsightsQueryInputDTO) => Result<CompetitorInsightsResultDTO, AppError> | Promise<Result<CompetitorInsightsResultDTO, AppError>>;
  runTopicIntelligence: (input: TopicIntelligenceRunInputDTO) => Result<TopicIntelligenceResultDTO, AppError> | Promise<Result<TopicIntelligenceResultDTO, AppError>>;
  getTopicIntelligence: (input: TopicIntelligenceQueryInputDTO) => Result<TopicIntelligenceResultDTO, AppError> | Promise<Result<TopicIntelligenceResultDTO, AppError>>;
  generatePlanningPlan: (input: PlanningGenerateInputDTO) => Result<PlanningPlanResultDTO, AppError> | Promise<Result<PlanningPlanResultDTO, AppError>>;
  getPlanningPlan: (input: PlanningGetPlanInputDTO) => Result<PlanningPlanResultDTO, AppError> | Promise<Result<PlanningPlanResultDTO, AppError>>;
  generateReport: (input: ReportGenerateInputDTO) => Result<ReportGenerateResultDTO, AppError> | Promise<Result<ReportGenerateResultDTO, AppError>>;
  exportReport: (input: ReportExportInputDTO) => Result<ReportExportResultDTO, AppError> | Promise<Result<ReportExportResultDTO, AppError>>;
  askAssistant: (input: AssistantAskInputDTO) => Result<AssistantAskResultDTO, AppError> | Promise<Result<AssistantAskResultDTO, AppError>>;
  listAssistantThreads: (input: AssistantThreadListInputDTO) => Result<AssistantThreadListResultDTO, AppError> | Promise<Result<AssistantThreadListResultDTO, AppError>>;
  getAssistantThreadMessages: (input: AssistantThreadMessagesInputDTO) => Result<AssistantThreadMessagesResultDTO, AppError> | Promise<Result<AssistantThreadMessagesResultDTO, AppError>>;
  getKpis: (query: KpiQueryDTO) => Result<KpiResultDTO, AppError>;
  getTimeseries: (query: TimeseriesQueryDTO) => Result<TimeseriesResultDTO, AppError>;
  getChannelInfo: (query: { channelId: string }) => Result<ChannelInfoDTO, AppError>;
}

export interface IpcMainLike {
  handle: (
    channel: string,
    listener: (_event: unknown, payload: unknown) => unknown,
  ) => void;
}

function createValidationError(input: unknown, issues: unknown): AppError {
  return AppError.create(
    'IPC_INVALID_PAYLOAD',
    'Przekazano niepoprawne dane wejściowe IPC.',
    'error',
    { input, issues },
  );
}

function createOutputError(payload: unknown, issues: unknown): AppError {
  return AppError.create(
    'IPC_INVALID_OUTPUT',
    'Wewnętrzna odpowiedź IPC ma niepoprawny format.',
    'error',
    { payload, issues },
  );
}

function createUnhandledHandlerError(cause: unknown): AppError {
  return AppError.create(
    'IPC_HANDLER_EXECUTION_FAILED',
    'Wewnętrzna obsluga komendy IPC zakonczona niepowodzeniem.',
    'error',
    {},
    cause instanceof Error ? cause : new Error(String(cause)),
  );
}

function serializeError<T>(resultSchema: z.ZodType<IpcResult<T>>, error: AppError): IpcResult<T> {
  const parsed = resultSchema.safeParse({
    ok: false,
    error: error.toDTO(),
  });

  if (parsed.success) {
    return parsed.data;
  }

  return {
    ok: false,
    error: AppError.create(
      'IPC_SERIALIZATION_FAILED',
      'Nie udało się zserializować błędu IPC.',
      'error',
        { issues: parsed.error.issues },
    ).toDTO(),
  };
}

function serializeSuccess<T>(
  outputSchema: z.ZodType<T>,
  resultSchema: z.ZodType<IpcResult<T>>,
  payload: unknown,
): IpcResult<T> {
  const validatedOutput = outputSchema.safeParse(payload);
  if (!validatedOutput.success) {
    return serializeError(resultSchema, createOutputError(payload, validatedOutput.error.issues));
  }

  const validatedResult = resultSchema.safeParse({
    ok: true,
    value: validatedOutput.data,
  });

  if (!validatedResult.success) {
    return serializeError(resultSchema, createOutputError(payload, validatedResult.error.issues));
  }

  return validatedResult.data;
}

function runHandler<TInput, TOutput>(
  payload: unknown,
  inputSchema: z.ZodType<TInput>,
  outputSchema: z.ZodType<TOutput>,
  resultSchema: z.ZodType<IpcResult<TOutput>>,
  execute: (input: TInput) => Result<TOutput, AppError>,
): IpcResult<TOutput> {
  const inputValidation = inputSchema.safeParse(payload);
  if (!inputValidation.success) {
    return serializeError(resultSchema, createValidationError(payload, inputValidation.error.issues));
  }

  const result = execute(inputValidation.data);
  if (!result.ok) {
    return serializeError(resultSchema, result.error);
  }

  return serializeSuccess(outputSchema, resultSchema, result.value);
}

async function runHandlerAsync<TInput, TOutput>(
  payload: unknown,
  inputSchema: z.ZodType<TInput>,
  outputSchema: z.ZodType<TOutput>,
  resultSchema: z.ZodType<IpcResult<TOutput>>,
  execute: (input: TInput) => Result<TOutput, AppError> | Promise<Result<TOutput, AppError>>,
): Promise<IpcResult<TOutput>> {
  const inputValidation = inputSchema.safeParse(payload);
  if (!inputValidation.success) {
    return serializeError(resultSchema, createValidationError(payload, inputValidation.error.issues));
  }

  try {
    const result = await execute(inputValidation.data);
    if (!result.ok) {
      return serializeError(resultSchema, result.error);
    }

    return serializeSuccess(outputSchema, resultSchema, result.value);
  } catch (cause) {
    return serializeError(resultSchema, createUnhandledHandlerError(cause));
  }
}

export function handleAppGetStatus(backend: DesktopIpcBackend, payload: unknown): AppStatusResult {
  return runHandler(
    payload,
    EmptyPayloadSchema,
    AppStatusDTOSchema,
    AppStatusResultSchema,
    () => backend.getAppStatus(),
  );
}

export function handleAppGetDataMode(backend: DesktopIpcBackend, payload: unknown): DataModeStatusResult {
  return runHandler(
    payload,
    EmptyPayloadSchema,
    DataModeStatusDTOSchema,
    DataModeStatusResultSchema,
    () => backend.getDataModeStatus(),
  );
}

export function handleAppSetDataMode(backend: DesktopIpcBackend, payload: unknown): DataModeStatusResult {
  return runHandler(
    payload,
    SetDataModeInputDTOSchema,
    DataModeStatusDTOSchema,
    DataModeStatusResultSchema,
    (input) => backend.setDataMode(input),
  );
}

export function handleAppProbeDataMode(backend: DesktopIpcBackend, payload: unknown): DataModeProbeResult {
  return runHandler(
    payload,
    DataModeProbeInputDTOSchema,
    DataModeProbeResultDTOSchema,
    DataModeProbeResultSchema,
    (input) => backend.probeDataMode(input),
  );
}

export function handleProfileList(backend: DesktopIpcBackend, payload: unknown): ProfileListResult {
  return runHandler(
    payload,
    EmptyPayloadSchema,
    ProfileListResultDTOSchema,
    ProfileListResultSchema,
    () => backend.listProfiles(),
  );
}

export function handleProfileCreate(backend: DesktopIpcBackend, payload: unknown): ProfileListResult {
  return runHandler(
    payload,
    ProfileCreateInputDTOSchema,
    ProfileListResultDTOSchema,
    ProfileListResultSchema,
    (input) => backend.createProfile(input),
  );
}

export function handleProfileSetActive(backend: DesktopIpcBackend, payload: unknown): ProfileListResult {
  return runHandler(
    payload,
    ProfileSetActiveInputDTOSchema,
    ProfileListResultDTOSchema,
    ProfileListResultSchema,
    (input) => backend.setActiveProfile(input),
  );
}

export function handleSettingsGet(backend: DesktopIpcBackend, payload: unknown): ProfileSettingsResult {
  return runHandler(
    payload,
    EmptyPayloadSchema,
    ProfileSettingsDTOSchema,
    ProfileSettingsResultSchema,
    () => backend.getProfileSettings(),
  );
}

export function handleSettingsUpdate(backend: DesktopIpcBackend, payload: unknown): ProfileSettingsResult {
  return runHandler(
    payload,
    SettingsUpdateInputDTOSchema,
    ProfileSettingsDTOSchema,
    ProfileSettingsResultSchema,
    (input) => backend.updateProfileSettings(input),
  );
}

export function handleAuthGetStatus(backend: DesktopIpcBackend, payload: unknown): AuthStatusResult {
  return runHandler(
    payload,
    EmptyPayloadSchema,
    AuthStatusDTOSchema,
    AuthStatusResultSchema,
    () => backend.getAuthStatus(),
  );
}

export function handleAuthConnect(backend: DesktopIpcBackend, payload: unknown): AuthStatusResult {
  return runHandler(
    payload,
    AuthConnectInputDTOSchema,
    AuthStatusDTOSchema,
    AuthStatusResultSchema,
    (input) => backend.connectAuth(input),
  );
}

export function handleAuthDisconnect(backend: DesktopIpcBackend, payload: unknown): AuthStatusResult {
  return runHandler(
    payload,
    EmptyPayloadSchema,
    AuthStatusDTOSchema,
    AuthStatusResultSchema,
    () => backend.disconnectAuth(),
  );
}

export function handleImportCsvPreview(
  backend: DesktopIpcBackend,
  payload: unknown,
): CsvImportPreviewResult {
  return runHandler(
    payload,
    CsvImportPreviewInputDTOSchema,
    CsvImportPreviewResultDTOSchema,
    CsvImportPreviewResultSchema,
    (input) => backend.previewCsvImport(input),
  );
}

export async function handleImportCsvRun(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<CsvImportRunResult> {
  return runHandlerAsync(
    payload,
    CsvImportRunInputDTOSchema,
    CsvImportRunResultDTOSchema,
    CsvImportRunResultSchema,
    (input) => backend.runCsvImport(input),
  );
}

export function handleSearchContent(
  backend: DesktopIpcBackend,
  payload: unknown,
): SearchContentResult {
  return runHandler(
    payload,
    SearchContentInputDTOSchema,
    SearchContentResultDTOSchema,
    SearchContentResultSchema,
    (input) => backend.searchContent(input),
  );
}

export async function handleSyncStart(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<SyncCommandResult> {
  return runHandlerAsync(
    payload,
    SyncStartInputDTOSchema,
    SyncCommandResultDTOSchema,
    SyncCommandResultSchema,
    (input) => backend.startSync(input),
  );
}

export async function handleSyncResume(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<SyncCommandResult> {
  return runHandlerAsync(
    payload,
    SyncResumeInputDTOSchema,
    SyncCommandResultDTOSchema,
    SyncCommandResultSchema,
    (input) => backend.resumeSync(input),
  );
}

export async function handleMlRunBaseline(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<MlRunBaselineResult> {
  return runHandlerAsync(
    payload,
    MlRunBaselineInputDTOSchema,
    MlRunBaselineResultDTOSchema,
    MlRunBaselineResultSchema,
    (input) => backend.runMlBaseline(input),
  );
}

export async function handleMlGetForecast(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<MlForecastResult> {
  return runHandlerAsync(
    payload,
    MlForecastQueryInputDTOSchema,
    MlForecastResultDTOSchema,
    MlForecastResultSchema,
    (input) => backend.getMlForecast(input),
  );
}

export async function handleMlDetectAnomalies(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<MlDetectAnomaliesResult> {
  return runHandlerAsync(
    payload,
    MlDetectAnomaliesInputDTOSchema,
    MlDetectAnomaliesResultDTOSchema,
    MlDetectAnomaliesResultSchema,
    (input) => backend.detectMlAnomalies(input),
  );
}

export async function handleMlGetAnomalies(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<MlAnomalyListResult> {
  return runHandlerAsync(
    payload,
    MlAnomalyQueryInputDTOSchema,
    MlAnomalyListResultDTOSchema,
    MlAnomalyListResultSchema,
    (input) => backend.getMlAnomalies(input),
  );
}

export async function handleMlGetTrend(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<MlTrendResult> {
  return runHandlerAsync(
    payload,
    MlTrendQueryInputDTOSchema,
    MlTrendResultDTOSchema,
    MlTrendResultSchema,
    (input) => backend.getMlTrend(input),
  );
}

export async function handleAnalyticsGetQualityScores(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<QualityScoreResult> {
  return runHandlerAsync(
    payload,
    QualityScoreQueryInputDTOSchema,
    QualityScoreResultDTOSchema,
    QualityScoreResultSchema,
    (input) => backend.getQualityScores(input),
  );
}

export async function handleAnalyticsSyncCompetitors(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<CompetitorSyncResult> {
  return runHandlerAsync(
    payload,
    CompetitorSyncInputDTOSchema,
    CompetitorSyncResultDTOSchema,
    CompetitorSyncResultSchema,
    (input) => backend.syncCompetitors(input),
  );
}

export async function handleAnalyticsGetCompetitorInsights(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<CompetitorInsightsResult> {
  return runHandlerAsync(
    payload,
    CompetitorInsightsQueryInputDTOSchema,
    CompetitorInsightsResultDTOSchema,
    CompetitorInsightsResultSchema,
    (input) => backend.getCompetitorInsights(input),
  );
}

export async function handleAnalyticsRunTopicIntelligence(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<TopicIntelligenceResult> {
  return runHandlerAsync(
    payload,
    TopicIntelligenceRunInputDTOSchema,
    TopicIntelligenceResultDTOSchema,
    TopicIntelligenceResultSchema,
    (input) => backend.runTopicIntelligence(input),
  );
}

export async function handleAnalyticsGetTopicIntelligence(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<TopicIntelligenceResult> {
  return runHandlerAsync(
    payload,
    TopicIntelligenceQueryInputDTOSchema,
    TopicIntelligenceResultDTOSchema,
    TopicIntelligenceResultSchema,
    (input) => backend.getTopicIntelligence(input),
  );
}

export async function handlePlanningGeneratePlan(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<PlanningPlanResult> {
  return runHandlerAsync(
    payload,
    PlanningGenerateInputDTOSchema,
    PlanningPlanResultDTOSchema,
    PlanningPlanResultSchema,
    (input) => backend.generatePlanningPlan(input),
  );
}

export async function handlePlanningGetPlan(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<PlanningPlanResult> {
  return runHandlerAsync(
    payload,
    PlanningGetPlanInputDTOSchema,
    PlanningPlanResultDTOSchema,
    PlanningPlanResultSchema,
    (input) => backend.getPlanningPlan(input),
  );
}

export async function handleReportsGenerate(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<ReportGenerateResult> {
  return runHandlerAsync(
    payload,
    ReportGenerateInputDTOSchema,
    ReportGenerateResultDTOSchema,
    ReportGenerateResultSchema,
    (input) => backend.generateReport(input),
  );
}

export async function handleReportsExport(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<ReportExportResult> {
  return runHandlerAsync(
    payload,
    ReportExportInputDTOSchema,
    ReportExportResultDTOSchema,
    ReportExportResultSchema,
    (input) => backend.exportReport(input),
  );
}

export async function handleAssistantAsk(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<AssistantAskResult> {
  return runHandlerAsync(
    payload,
    AssistantAskInputDTOSchema,
    AssistantAskResultDTOSchema,
    AssistantAskResultSchema,
    (input) => backend.askAssistant(input),
  );
}

export async function handleAssistantListThreads(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<AssistantThreadListResult> {
  return runHandlerAsync(
    payload,
    AssistantThreadListInputDTOSchema,
    AssistantThreadListResultDTOSchema,
    AssistantThreadListResultSchema,
    (input) => backend.listAssistantThreads(input),
  );
}

export async function handleAssistantGetThreadMessages(
  backend: DesktopIpcBackend,
  payload: unknown,
): Promise<AssistantThreadMessagesResult> {
  return runHandlerAsync(
    payload,
    AssistantThreadMessagesInputDTOSchema,
    AssistantThreadMessagesResultDTOSchema,
    AssistantThreadMessagesResultSchema,
    (input) => backend.getAssistantThreadMessages(input),
  );
}

export function handleDbGetKpis(backend: DesktopIpcBackend, payload: unknown): KpiResult {
  return runHandler(
    payload,
    KpiQueryDTOSchema,
    KpiResultDTOSchema,
    KpiResultSchema,
    (query) => backend.getKpis(query),
  );
}

export function handleDbGetTimeseries(backend: DesktopIpcBackend, payload: unknown): TimeseriesResult {
  return runHandler(
    payload,
    TimeseriesQueryDTOSchema,
    TimeseriesResultDTOSchema,
    TimeseriesResultSchema,
    (query) => backend.getTimeseries(query),
  );
}

export function handleDbGetChannelInfo(backend: DesktopIpcBackend, payload: unknown): ChannelInfoResult {
  return runHandler(
    payload,
    ChannelIdDTOSchema,
    ChannelInfoDTOSchema,
    ChannelInfoResultSchema,
    (query) => backend.getChannelInfo(query),
  );
}

export function registerIpcHandlers(ipcMain: IpcMainLike, backend: DesktopIpcBackend): void {
  ipcMain.handle(IPC_CHANNELS.APP_GET_STATUS, (_event, payload) => handleAppGetStatus(backend, payload));
  ipcMain.handle(IPC_CHANNELS.APP_GET_DATA_MODE, (_event, payload) => handleAppGetDataMode(backend, payload));
  ipcMain.handle(IPC_CHANNELS.APP_SET_DATA_MODE, (_event, payload) => handleAppSetDataMode(backend, payload));
  ipcMain.handle(IPC_CHANNELS.APP_PROBE_DATA_MODE, (_event, payload) => handleAppProbeDataMode(backend, payload));
  ipcMain.handle(IPC_CHANNELS.IMPORT_CSV_PREVIEW, (_event, payload) => handleImportCsvPreview(backend, payload));
  ipcMain.handle(IPC_CHANNELS.IMPORT_CSV_RUN, (_event, payload) => handleImportCsvRun(backend, payload));
  ipcMain.handle(IPC_CHANNELS.SEARCH_CONTENT, (_event, payload) => handleSearchContent(backend, payload));
  ipcMain.handle(IPC_CHANNELS.PROFILE_LIST, (_event, payload) => handleProfileList(backend, payload));
  ipcMain.handle(IPC_CHANNELS.PROFILE_CREATE, (_event, payload) => handleProfileCreate(backend, payload));
  ipcMain.handle(IPC_CHANNELS.PROFILE_SET_ACTIVE, (_event, payload) => handleProfileSetActive(backend, payload));
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, payload) => handleSettingsGet(backend, payload));
  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_event, payload) => handleSettingsUpdate(backend, payload));
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_STATUS, (_event, payload) => handleAuthGetStatus(backend, payload));
  ipcMain.handle(IPC_CHANNELS.AUTH_CONNECT, (_event, payload) => handleAuthConnect(backend, payload));
  ipcMain.handle(IPC_CHANNELS.AUTH_DISCONNECT, (_event, payload) => handleAuthDisconnect(backend, payload));
  ipcMain.handle(IPC_CHANNELS.SYNC_START, (_event, payload) => handleSyncStart(backend, payload));
  ipcMain.handle(IPC_CHANNELS.SYNC_RESUME, (_event, payload) => handleSyncResume(backend, payload));
  ipcMain.handle(IPC_CHANNELS.ML_RUN_BASELINE, (_event, payload) => handleMlRunBaseline(backend, payload));
  ipcMain.handle(IPC_CHANNELS.ML_GET_FORECAST, (_event, payload) => handleMlGetForecast(backend, payload));
  ipcMain.handle(IPC_CHANNELS.ML_DETECT_ANOMALIES, (_event, payload) => handleMlDetectAnomalies(backend, payload));
  ipcMain.handle(IPC_CHANNELS.ML_GET_ANOMALIES, (_event, payload) => handleMlGetAnomalies(backend, payload));
  ipcMain.handle(IPC_CHANNELS.ML_GET_TREND, (_event, payload) => handleMlGetTrend(backend, payload));
  ipcMain.handle(IPC_CHANNELS.ANALYTICS_GET_QUALITY_SCORES, (_event, payload) => handleAnalyticsGetQualityScores(backend, payload));
  ipcMain.handle(IPC_CHANNELS.ANALYTICS_SYNC_COMPETITORS, (_event, payload) => handleAnalyticsSyncCompetitors(backend, payload));
  ipcMain.handle(IPC_CHANNELS.ANALYTICS_GET_COMPETITOR_INSIGHTS, (_event, payload) => handleAnalyticsGetCompetitorInsights(backend, payload));
  ipcMain.handle(IPC_CHANNELS.ANALYTICS_RUN_TOPIC_INTELLIGENCE, (_event, payload) => handleAnalyticsRunTopicIntelligence(backend, payload));
  ipcMain.handle(IPC_CHANNELS.ANALYTICS_GET_TOPIC_INTELLIGENCE, (_event, payload) => handleAnalyticsGetTopicIntelligence(backend, payload));
  ipcMain.handle(IPC_CHANNELS.PLANNING_GENERATE_PLAN, (_event, payload) => handlePlanningGeneratePlan(backend, payload));
  ipcMain.handle(IPC_CHANNELS.PLANNING_GET_PLAN, (_event, payload) => handlePlanningGetPlan(backend, payload));
  ipcMain.handle(IPC_CHANNELS.REPORTS_GENERATE, (_event, payload) => handleReportsGenerate(backend, payload));
  ipcMain.handle(IPC_CHANNELS.REPORTS_EXPORT, (_event, payload) => handleReportsExport(backend, payload));
  ipcMain.handle(IPC_CHANNELS.ASSISTANT_ASK, (_event, payload) => handleAssistantAsk(backend, payload));
  ipcMain.handle(IPC_CHANNELS.ASSISTANT_LIST_THREADS, (_event, payload) => handleAssistantListThreads(backend, payload));
  ipcMain.handle(IPC_CHANNELS.ASSISTANT_GET_THREAD_MESSAGES, (_event, payload) => handleAssistantGetThreadMessages(backend, payload));
  ipcMain.handle(IPC_CHANNELS.DB_GET_KPIS, (_event, payload) => handleDbGetKpis(backend, payload));
  ipcMain.handle(IPC_CHANNELS.DB_GET_TIMESERIES, (_event, payload) => handleDbGetTimeseries(backend, payload));
  ipcMain.handle(IPC_CHANNELS.DB_GET_CHANNEL_INFO, (_event, payload) => handleDbGetChannelInfo(backend, payload));
}
