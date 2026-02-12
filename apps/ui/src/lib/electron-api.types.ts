import type {
  DataModeProbeInputDTO,
  DataModeProbeResult,
  DataModeStatusResult,
  SetDataModeInputDTO,
  AppStatusResult,
  ChannelIdDTO,
  ChannelInfoResult,
  KpiQueryDTO,
  KpiResult,
  SyncCommandResult,
  SyncCompleteEvent,
  SyncErrorEvent,
  SyncProgressEvent,
  SyncResumeInputDTO,
  SyncStartInputDTO,
  TimeseriesQueryDTO,
  TimeseriesResult,
} from '@moze/shared';

export interface ElectronAPI {
  appGetStatus: () => Promise<AppStatusResult>;
  appGetDataMode: () => Promise<DataModeStatusResult>;
  appSetDataMode: (input: SetDataModeInputDTO) => Promise<DataModeStatusResult>;
  appProbeDataMode: (input: DataModeProbeInputDTO) => Promise<DataModeProbeResult>;
  syncStart: (input: SyncStartInputDTO) => Promise<SyncCommandResult>;
  syncResume: (input: SyncResumeInputDTO) => Promise<SyncCommandResult>;
  dbGetKpis: (query: KpiQueryDTO) => Promise<KpiResult>;
  dbGetTimeseries: (query: TimeseriesQueryDTO) => Promise<TimeseriesResult>;
  dbGetChannelInfo: (query: ChannelIdDTO) => Promise<ChannelInfoResult>;
  onSyncProgress: (callback: (event: SyncProgressEvent) => void) => () => void;
  onSyncComplete: (callback: (event: SyncCompleteEvent) => void) => () => void;
  onSyncError: (callback: (event: SyncErrorEvent) => void) => () => void;
}
