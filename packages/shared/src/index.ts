// Types
export { type Result, type Ok, type Err, ok, err, isOk, isErr, unwrap } from './types/result.ts';

// Errors
export { AppError, AppErrorSchema, SEVERITY, type Severity, type AppErrorDTO } from './errors/app-error.ts';

// IPC Contracts
export {
  IpcResultSchema,
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
