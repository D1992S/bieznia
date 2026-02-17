import type {
  DataModeProbeInputDTO,
  DataModeProbeResult,
  DataModeStatusResult,
  SetDataModeInputDTO,
  AuthConnectInputDTO,
  AuthStatusResult,
  CsvImportPreviewInputDTO,
  CsvImportPreviewResult,
  CsvImportRunInputDTO,
  CsvImportRunResult,
  AppStatusResult,
  ChannelIdDTO,
  ChannelInfoResult,
  KpiQueryDTO,
  KpiResult,
  MlAnomalyListResult,
  MlAnomalyQueryInputDTO,
  MlDetectAnomaliesInputDTO,
  MlDetectAnomaliesResult,
  MlForecastQueryInputDTO,
  MlForecastResult,
  MlRunBaselineInputDTO,
  MlRunBaselineResult,
  MlTrendQueryInputDTO,
  MlTrendResult,
  QualityScoreQueryInputDTO,
  QualityScoreResult,
  CompetitorSyncInputDTO,
  CompetitorSyncResult,
  CompetitorInsightsQueryInputDTO,
  CompetitorInsightsResult,
  ProfileCreateInputDTO,
  ProfileListResult,
  ProfileSetActiveInputDTO,
  ProfileSettingsResult,
  ReportExportInputDTO,
  ReportExportResult,
  ReportGenerateInputDTO,
  ReportGenerateResult,
  SearchContentInputDTO,
  SearchContentResult,
  AssistantAskInputDTO,
  AssistantAskResult,
  AssistantThreadListInputDTO,
  AssistantThreadListResult,
  AssistantThreadMessagesInputDTO,
  AssistantThreadMessagesResult,
  SettingsUpdateInputDTO,
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
  profileList: () => Promise<ProfileListResult>;
  profileCreate: (input: ProfileCreateInputDTO) => Promise<ProfileListResult>;
  profileSetActive: (input: ProfileSetActiveInputDTO) => Promise<ProfileListResult>;
  settingsGet: () => Promise<ProfileSettingsResult>;
  settingsUpdate: (input: SettingsUpdateInputDTO) => Promise<ProfileSettingsResult>;
  authGetStatus: () => Promise<AuthStatusResult>;
  authConnect: (input: AuthConnectInputDTO) => Promise<AuthStatusResult>;
  authDisconnect: () => Promise<AuthStatusResult>;
  importCsvPreview: (input: CsvImportPreviewInputDTO) => Promise<CsvImportPreviewResult>;
  importCsvRun: (input: CsvImportRunInputDTO) => Promise<CsvImportRunResult>;
  searchContent: (input: SearchContentInputDTO) => Promise<SearchContentResult>;
  syncStart: (input: SyncStartInputDTO) => Promise<SyncCommandResult>;
  syncResume: (input: SyncResumeInputDTO) => Promise<SyncCommandResult>;
  mlRunBaseline: (input: MlRunBaselineInputDTO) => Promise<MlRunBaselineResult>;
  mlGetForecast: (input: MlForecastQueryInputDTO) => Promise<MlForecastResult>;
  mlDetectAnomalies: (input: MlDetectAnomaliesInputDTO) => Promise<MlDetectAnomaliesResult>;
  mlGetAnomalies: (input: MlAnomalyQueryInputDTO) => Promise<MlAnomalyListResult>;
  mlGetTrend: (input: MlTrendQueryInputDTO) => Promise<MlTrendResult>;
  analyticsGetQualityScores: (input: QualityScoreQueryInputDTO) => Promise<QualityScoreResult>;
  analyticsSyncCompetitors: (input: CompetitorSyncInputDTO) => Promise<CompetitorSyncResult>;
  analyticsGetCompetitorInsights: (input: CompetitorInsightsQueryInputDTO) => Promise<CompetitorInsightsResult>;
  reportsGenerate: (input: ReportGenerateInputDTO) => Promise<ReportGenerateResult>;
  reportsExport: (input: ReportExportInputDTO) => Promise<ReportExportResult>;
  assistantAsk: (input: AssistantAskInputDTO) => Promise<AssistantAskResult>;
  assistantListThreads: (input: AssistantThreadListInputDTO) => Promise<AssistantThreadListResult>;
  assistantGetThreadMessages: (input: AssistantThreadMessagesInputDTO) => Promise<AssistantThreadMessagesResult>;
  dbGetKpis: (query: KpiQueryDTO) => Promise<KpiResult>;
  dbGetTimeseries: (query: TimeseriesQueryDTO) => Promise<TimeseriesResult>;
  dbGetChannelInfo: (query: ChannelIdDTO) => Promise<ChannelInfoResult>;
  onSyncProgress: (callback: (event: SyncProgressEvent) => void) => () => void;
  onSyncComplete: (callback: (event: SyncCompleteEvent) => void) => () => void;
  onSyncError: (callback: (event: SyncErrorEvent) => void) => () => void;
}
