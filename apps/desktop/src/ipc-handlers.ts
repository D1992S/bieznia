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
  EmptyPayloadSchema,
  IPC_CHANNELS,
  KpiQueryDTOSchema,
  KpiResultDTOSchema,
  KpiResultSchema,
  MlForecastQueryInputDTOSchema,
  MlForecastResultDTOSchema,
  MlForecastResultSchema,
  MlRunBaselineInputDTOSchema,
  MlRunBaselineResultDTOSchema,
  MlRunBaselineResultSchema,
  ReportExportInputDTOSchema,
  ReportExportResultDTOSchema,
  ReportExportResultSchema,
  ReportGenerateInputDTOSchema,
  ReportGenerateResultDTOSchema,
  ReportGenerateResultSchema,
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
  type ChannelInfoDTO,
  type ChannelInfoResult,
  type IpcResult,
  type KpiQueryDTO,
  type KpiResult,
  type KpiResultDTO,
  type MlForecastQueryInputDTO,
  type MlForecastResult,
  type MlForecastResultDTO,
  type MlRunBaselineInputDTO,
  type MlRunBaselineResult,
  type MlRunBaselineResultDTO,
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
  startSync: (input: SyncStartInputDTO) => Result<SyncCommandResultDTO, AppError> | Promise<Result<SyncCommandResultDTO, AppError>>;
  resumeSync: (input: SyncResumeInputDTO) => Result<SyncCommandResultDTO, AppError> | Promise<Result<SyncCommandResultDTO, AppError>>;
  runMlBaseline: (input: MlRunBaselineInputDTO) => Result<MlRunBaselineResultDTO, AppError> | Promise<Result<MlRunBaselineResultDTO, AppError>>;
  getMlForecast: (input: MlForecastQueryInputDTO) => Result<MlForecastResultDTO, AppError> | Promise<Result<MlForecastResultDTO, AppError>>;
  generateReport: (input: ReportGenerateInputDTO) => Result<ReportGenerateResultDTO, AppError> | Promise<Result<ReportGenerateResultDTO, AppError>>;
  exportReport: (input: ReportExportInputDTO) => Result<ReportExportResultDTO, AppError> | Promise<Result<ReportExportResultDTO, AppError>>;
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
  ipcMain.handle(IPC_CHANNELS.SYNC_START, (_event, payload) => handleSyncStart(backend, payload));
  ipcMain.handle(IPC_CHANNELS.SYNC_RESUME, (_event, payload) => handleSyncResume(backend, payload));
  ipcMain.handle(IPC_CHANNELS.ML_RUN_BASELINE, (_event, payload) => handleMlRunBaseline(backend, payload));
  ipcMain.handle(IPC_CHANNELS.ML_GET_FORECAST, (_event, payload) => handleMlGetForecast(backend, payload));
  ipcMain.handle(IPC_CHANNELS.REPORTS_GENERATE, (_event, payload) => handleReportsGenerate(backend, payload));
  ipcMain.handle(IPC_CHANNELS.REPORTS_EXPORT, (_event, payload) => handleReportsExport(backend, payload));
  ipcMain.handle(IPC_CHANNELS.DB_GET_KPIS, (_event, payload) => handleDbGetKpis(backend, payload));
  ipcMain.handle(IPC_CHANNELS.DB_GET_TIMESERIES, (_event, payload) => handleDbGetTimeseries(backend, payload));
  ipcMain.handle(IPC_CHANNELS.DB_GET_CHANNEL_INFO, (_event, payload) => handleDbGetChannelInfo(backend, payload));
}
