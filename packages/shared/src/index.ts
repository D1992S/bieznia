// Types
export { type Result, type Ok, type Err, ok, err, isOk, isErr, unwrap } from './types/result.ts';

// Errors
export { AppError, AppErrorSchema, SEVERITY, type Severity, type AppErrorDTO } from './errors/app-error.ts';

// IPC Contracts
export {
  type IpcResult,
  type IpcOk,
  type IpcErr,
  IpcResultSchema,
  EmptyPayloadSchema,
  AppStatusResultSchema,
  type AppStatusResult,
  DataModeStatusResultSchema,
  type DataModeStatusResult,
  DataModeProbeResultSchema,
  type DataModeProbeResult,
  SyncCommandResultSchema,
  type SyncCommandResult,
  KpiResultSchema,
  type KpiResult,
  TimeseriesResultSchema,
  type TimeseriesResult,
  ChannelInfoResultSchema,
  type ChannelInfoResult,
  IPC_CHANNELS,
  IPC_EVENTS,
  type IpcChannel,
  type IpcEvent,
} from './ipc/contracts.ts';

// DTOs
export {
  type AppStatusDTO,
  AppStatusDTOSchema,
  type KpiQueryDTO,
  KpiQueryDTOSchema,
  type KpiResultDTO,
  KpiResultDTOSchema,
  type TimeseriesQueryDTO,
  TimeseriesQueryDTOSchema,
  type TimeseriesResultDTO,
  TimeseriesResultDTOSchema,
  type TimeseriesPoint,
  TimeseriesPointSchema,
  type ChannelIdDTO,
  ChannelIdDTOSchema,
  type ChannelInfoDTO,
  ChannelInfoDTOSchema,
  DataModeSchema,
  type DataMode,
  DataModeStatusDTOSchema,
  type DataModeStatusDTO,
  SetDataModeInputDTOSchema,
  type SetDataModeInputDTO,
  DataModeProbeInputDTOSchema,
  type DataModeProbeInputDTO,
  DataModeProbeResultDTOSchema,
  type DataModeProbeResultDTO,
  SyncStartInputDTOSchema,
  type SyncStartInputDTO,
  SyncResumeInputDTOSchema,
  type SyncResumeInputDTO,
  SyncCommandResultDTOSchema,
  type SyncCommandResultDTO,
} from './dto/index.ts';

// Events
export {
  type SyncProgressEvent,
  SyncProgressEventSchema,
  type SyncCompleteEvent,
  SyncCompleteEventSchema,
  type SyncErrorEvent,
  SyncErrorEventSchema,
} from './events/index.ts';

// Logger
export {
  createLogger,
  LOG_LEVELS,
  type Logger,
  type LogEntry,
  type LogLevel,
  type LogContext,
  type LogWriter,
  type Clock,
  type CreateLoggerOptions,
} from './logger/index.ts';
