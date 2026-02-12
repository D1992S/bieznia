import {
  AppError,
  DataModeProbeInputDTOSchema,
  DataModeProbeResultSchema,
  DataModeStatusResultSchema,
  SetDataModeInputDTOSchema,
  AppStatusResultSchema,
  ChannelIdDTOSchema,
  ChannelInfoResultSchema,
  EmptyPayloadSchema,
  IPC_CHANNELS,
  IPC_EVENTS,
  KpiQueryDTOSchema,
  KpiResultSchema,
  MlForecastQueryInputDTOSchema,
  MlForecastResultSchema,
  MlRunBaselineInputDTOSchema,
  MlRunBaselineResultSchema,
  ReportExportInputDTOSchema,
  ReportExportResultSchema,
  ReportGenerateInputDTOSchema,
  ReportGenerateResultSchema,
  SyncCommandResultSchema,
  SyncCompleteEventSchema,
  SyncErrorEventSchema,
  SyncProgressEventSchema,
  SyncResumeInputDTOSchema,
  SyncStartInputDTOSchema,
  TimeseriesQueryDTOSchema,
  TimeseriesResultSchema,
  type DataModeProbeInputDTO,
  type DataModeProbeResult,
  type DataModeStatusResult,
  type SetDataModeInputDTO,
  type AppStatusResult,
  type ChannelIdDTO,
  type ChannelInfoResult,
  type KpiQueryDTO,
  type KpiResult,
  type MlForecastQueryInputDTO,
  type MlForecastResult,
  type MlRunBaselineInputDTO,
  type MlRunBaselineResult,
  type ReportExportInputDTO,
  type ReportExportResult,
  type ReportGenerateInputDTO,
  type ReportGenerateResult,
  type SyncCommandResult,
  type SyncCompleteEvent,
  type SyncErrorEvent,
  type SyncProgressEvent,
  type SyncResumeInputDTO,
  type SyncStartInputDTO,
  type TimeseriesQueryDTO,
  type TimeseriesResult,
} from '@moze/shared';
import { contextBridge, ipcRenderer } from 'electron';
import type { z } from 'zod/v4';

export interface ElectronAPI {
  appGetStatus: () => Promise<AppStatusResult>;
  appGetDataMode: () => Promise<DataModeStatusResult>;
  appSetDataMode: (input: SetDataModeInputDTO) => Promise<DataModeStatusResult>;
  appProbeDataMode: (input: DataModeProbeInputDTO) => Promise<DataModeProbeResult>;
  syncStart: (input: SyncStartInputDTO) => Promise<SyncCommandResult>;
  syncResume: (input: SyncResumeInputDTO) => Promise<SyncCommandResult>;
  mlRunBaseline: (input: MlRunBaselineInputDTO) => Promise<MlRunBaselineResult>;
  mlGetForecast: (input: MlForecastQueryInputDTO) => Promise<MlForecastResult>;
  reportsGenerate: (input: ReportGenerateInputDTO) => Promise<ReportGenerateResult>;
  reportsExport: (input: ReportExportInputDTO) => Promise<ReportExportResult>;
  dbGetKpis: (query: KpiQueryDTO) => Promise<KpiResult>;
  dbGetTimeseries: (query: TimeseriesQueryDTO) => Promise<TimeseriesResult>;
  dbGetChannelInfo: (query: ChannelIdDTO) => Promise<ChannelInfoResult>;
  onSyncProgress: (callback: (event: SyncProgressEvent) => void) => () => void;
  onSyncComplete: (callback: (event: SyncCompleteEvent) => void) => () => void;
  onSyncError: (callback: (event: SyncErrorEvent) => void) => () => void;
}

function createIpcError(code: string, message: string, context: Record<string, unknown>): ReturnType<AppError['toDTO']> {
  return AppError.create(code, message, 'error', context).toDTO();
}

function toResultOrFallback<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }

  const fallback = schema.safeParse({
    ok: false,
    error: createIpcError(
      'IPC_RESPONSE_INVALID',
      'Odpowiedz IPC ma niepoprawny format.',
      { payload, issues: parsed.error.issues },
    ),
  });

  if (fallback.success) {
    return fallback.data;
  }

  throw new Error('Schema odpowiedzi IPC musi akceptowac format Result<AppError>.');
}

function inputValidationFallback<T>(schema: z.ZodType<T>, payload: unknown, issues: unknown): T {
  return toResultOrFallback(schema, {
    ok: false,
    error: createIpcError(
      'IPC_INVALID_PAYLOAD',
      'Przekazano niepoprawne dane wejsciowe do IPC.',
      { payload, issues },
    ),
  });
}

async function invokeValidated<TInput, TResult>(
  channel: string,
  payload: unknown,
  inputSchema: z.ZodType<TInput>,
  resultSchema: z.ZodType<TResult>,
): Promise<TResult> {
  const parsedInput = inputSchema.safeParse(payload);
  if (!parsedInput.success) {
    return inputValidationFallback(resultSchema, payload, parsedInput.error.issues);
  }

  const response: unknown = await ipcRenderer.invoke(channel, parsedInput.data);
  return toResultOrFallback(resultSchema, response);
}

function subscribeEvent<T>(
  eventName: string,
  schema: z.ZodType<T>,
  callback: (event: T) => void,
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return;
    }

    callback(parsed.data);
  };

  ipcRenderer.on(eventName, handler);
  return () => {
    ipcRenderer.removeListener(eventName, handler);
  };
}

const api: ElectronAPI = {
  appGetStatus: () =>
    invokeValidated(
      IPC_CHANNELS.APP_GET_STATUS,
      undefined,
      EmptyPayloadSchema,
      AppStatusResultSchema,
    ),
  appGetDataMode: () =>
    invokeValidated(
      IPC_CHANNELS.APP_GET_DATA_MODE,
      undefined,
      EmptyPayloadSchema,
      DataModeStatusResultSchema,
    ),
  appSetDataMode: (input) =>
    invokeValidated(
      IPC_CHANNELS.APP_SET_DATA_MODE,
      input,
      SetDataModeInputDTOSchema,
      DataModeStatusResultSchema,
    ),
  appProbeDataMode: (input) =>
    invokeValidated(
      IPC_CHANNELS.APP_PROBE_DATA_MODE,
      input,
      DataModeProbeInputDTOSchema,
      DataModeProbeResultSchema,
    ),
  syncStart: (input) =>
    invokeValidated(
      IPC_CHANNELS.SYNC_START,
      input,
      SyncStartInputDTOSchema,
      SyncCommandResultSchema,
    ),
  syncResume: (input) =>
    invokeValidated(
      IPC_CHANNELS.SYNC_RESUME,
      input,
      SyncResumeInputDTOSchema,
      SyncCommandResultSchema,
    ),
  mlRunBaseline: (input) =>
    invokeValidated(
      IPC_CHANNELS.ML_RUN_BASELINE,
      input,
      MlRunBaselineInputDTOSchema,
      MlRunBaselineResultSchema,
    ),
  mlGetForecast: (input) =>
    invokeValidated(
      IPC_CHANNELS.ML_GET_FORECAST,
      input,
      MlForecastQueryInputDTOSchema,
      MlForecastResultSchema,
    ),
  reportsGenerate: (input) =>
    invokeValidated(
      IPC_CHANNELS.REPORTS_GENERATE,
      input,
      ReportGenerateInputDTOSchema,
      ReportGenerateResultSchema,
    ),
  reportsExport: (input) =>
    invokeValidated(
      IPC_CHANNELS.REPORTS_EXPORT,
      input,
      ReportExportInputDTOSchema,
      ReportExportResultSchema,
    ),
  dbGetKpis: (query) =>
    invokeValidated(
      IPC_CHANNELS.DB_GET_KPIS,
      query,
      KpiQueryDTOSchema,
      KpiResultSchema,
    ),
  dbGetTimeseries: (query) =>
    invokeValidated(
      IPC_CHANNELS.DB_GET_TIMESERIES,
      query,
      TimeseriesQueryDTOSchema,
      TimeseriesResultSchema,
    ),
  dbGetChannelInfo: (query) =>
    invokeValidated(
      IPC_CHANNELS.DB_GET_CHANNEL_INFO,
      query,
      ChannelIdDTOSchema,
      ChannelInfoResultSchema,
    ),
  onSyncProgress: (callback) => subscribeEvent(IPC_EVENTS.SYNC_PROGRESS, SyncProgressEventSchema, callback),
  onSyncComplete: (callback) => subscribeEvent(IPC_EVENTS.SYNC_COMPLETE, SyncCompleteEventSchema, callback),
  onSyncError: (callback) => subscribeEvent(IPC_EVENTS.SYNC_ERROR, SyncErrorEventSchema, callback),
};

contextBridge.exposeInMainWorld('electronAPI', api);
