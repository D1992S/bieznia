import { z } from 'zod/v4';
import { AppErrorSchema, type AppErrorDTO } from '../errors/app-error.ts';

export interface IpcOk<T> {
  ok: true;
  value: T;
}

export interface IpcErr {
  ok: false;
  error: AppErrorDTO;
}

export type IpcResult<T> = IpcOk<T> | IpcErr;

export const IpcResultSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.union([
    z.object({ ok: z.literal(true), value: dataSchema }),
    z.object({ ok: z.literal(false), error: AppErrorSchema }),
  ]);

export const EmptyPayloadSchema = z.undefined();

export const AppStatusDTOSchema = z.object({
  version: z.string(),
  dbReady: z.boolean(),
  profileId: z.string().nullable(),
  syncRunning: z.boolean(),
  lastSyncAt: z.iso.datetime().nullable(),
});

export type AppStatusDTO = z.infer<typeof AppStatusDTOSchema>;
export const AppStatusResultSchema = IpcResultSchema(AppStatusDTOSchema);
export type AppStatusResult = z.infer<typeof AppStatusResultSchema>;

export const KpiQueryDTOSchema = z.object({
  channelId: z.string(),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
});

export type KpiQueryDTO = z.infer<typeof KpiQueryDTOSchema>;

export const KpiResultDTOSchema = z.object({
  subscribers: z.number(),
  subscribersDelta: z.number(),
  views: z.number(),
  viewsDelta: z.number(),
  videos: z.number(),
  videosDelta: z.number(),
  avgViewsPerVideo: z.number(),
  engagementRate: z.number(),
});

export type KpiResultDTO = z.infer<typeof KpiResultDTOSchema>;
export const KpiResultSchema = IpcResultSchema(KpiResultDTOSchema);
export type KpiResult = z.infer<typeof KpiResultSchema>;

export const TimeseriesQueryDTOSchema = z.object({
  channelId: z.string(),
  metric: z.enum(['views', 'subscribers', 'likes', 'comments']),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  granularity: z.enum(['day', 'week', 'month']).default('day'),
});

export type TimeseriesQueryDTO = z.infer<typeof TimeseriesQueryDTOSchema>;

export const TimeseriesPointSchema = z.object({
  date: z.iso.date(),
  value: z.number(),
  predicted: z.number().nullable().optional(),
  confidenceLow: z.number().nullable().optional(),
  confidenceHigh: z.number().nullable().optional(),
});

export type TimeseriesPoint = z.infer<typeof TimeseriesPointSchema>;

export const TimeseriesResultDTOSchema = z.object({
  metric: z.string(),
  granularity: z.string(),
  points: z.array(TimeseriesPointSchema),
});

export type TimeseriesResultDTO = z.infer<typeof TimeseriesResultDTOSchema>;
export const TimeseriesResultSchema = IpcResultSchema(TimeseriesResultDTOSchema);
export type TimeseriesResult = z.infer<typeof TimeseriesResultSchema>;

export const ChannelIdDTOSchema = z.object({
  channelId: z.string(),
});

export type ChannelIdDTO = z.infer<typeof ChannelIdDTOSchema>;

export const ChannelInfoDTOSchema = z.object({
  channelId: z.string(),
  name: z.string(),
  description: z.string(),
  thumbnailUrl: z.url().nullable(),
  subscriberCount: z.number(),
  videoCount: z.number(),
  viewCount: z.number(),
  createdAt: z.iso.datetime(),
  lastSyncAt: z.iso.datetime().nullable(),
});

export type ChannelInfoDTO = z.infer<typeof ChannelInfoDTOSchema>;
export const ChannelInfoResultSchema = IpcResultSchema(ChannelInfoDTOSchema);
export type ChannelInfoResult = z.infer<typeof ChannelInfoResultSchema>;

export const DataModeSchema = z.enum(['fake', 'real', 'record']);
export type DataMode = z.infer<typeof DataModeSchema>;

export const DataModeStatusDTOSchema = z.object({
  mode: DataModeSchema,
  availableModes: z.array(DataModeSchema).min(1),
  source: z.string(),
});

export type DataModeStatusDTO = z.infer<typeof DataModeStatusDTOSchema>;
export const DataModeStatusResultSchema = IpcResultSchema(DataModeStatusDTOSchema);
export type DataModeStatusResult = z.infer<typeof DataModeStatusResultSchema>;

export const SetDataModeInputDTOSchema = z.object({
  mode: DataModeSchema,
});

export type SetDataModeInputDTO = z.infer<typeof SetDataModeInputDTOSchema>;

export const DataModeProbeInputDTOSchema = z.object({
  channelId: z.string(),
  videoIds: z.array(z.string()).min(1).max(20).default(['VID-001']),
  recentLimit: z.number().int().min(1).max(50).default(5),
});

export type DataModeProbeInputDTO = z.infer<typeof DataModeProbeInputDTOSchema>;

export const DataModeProbeResultDTOSchema = z.object({
  mode: DataModeSchema,
  providerName: z.string(),
  channelId: z.string(),
  recentVideos: z.number().int().nonnegative(),
  videoStats: z.number().int().nonnegative(),
  recordFilePath: z.string().nullable(),
});

export type DataModeProbeResultDTO = z.infer<typeof DataModeProbeResultDTOSchema>;
export const DataModeProbeResultSchema = IpcResultSchema(DataModeProbeResultDTOSchema);
export type DataModeProbeResult = z.infer<typeof DataModeProbeResultSchema>;

export const SyncStartInputDTOSchema = z.object({
  channelId: z.string().min(1),
  profileId: z.string().min(1).nullable().optional(),
  recentLimit: z.number().int().min(1).max(100).default(20),
});

export type SyncStartInputDTO = z.infer<typeof SyncStartInputDTOSchema>;

export const SyncResumeInputDTOSchema = z.object({
  syncRunId: z.number().int().positive(),
  channelId: z.string().min(1),
  recentLimit: z.number().int().min(1).max(100).default(20),
});

export type SyncResumeInputDTO = z.infer<typeof SyncResumeInputDTOSchema>;

export const SyncCommandResultDTOSchema = z.object({
  syncRunId: z.number().int().positive(),
  status: z.enum(['running', 'completed', 'failed']),
  stage: z.string(),
  recordsProcessed: z.number().int().nonnegative(),
  pipelineFeatures: z.number().int().nonnegative().nullable(),
});

export type SyncCommandResultDTO = z.infer<typeof SyncCommandResultDTOSchema>;
export const SyncCommandResultSchema = IpcResultSchema(SyncCommandResultDTOSchema);
export type SyncCommandResult = z.infer<typeof SyncCommandResultSchema>;

export const MlTargetMetricSchema = z.enum(['views', 'subscribers']);
export type MlTargetMetric = z.infer<typeof MlTargetMetricSchema>;

export const MlModelTypeSchema = z.enum(['holt-winters', 'linear-regression']);
export type MlModelType = z.infer<typeof MlModelTypeSchema>;

export const MlModelStatusSchema = z.enum(['active', 'shadow', 'rejected', 'insufficient_data']);
export type MlModelStatus = z.infer<typeof MlModelStatusSchema>;

export const MlRunBaselineInputDTOSchema = z.object({
  channelId: z.string().min(1),
  targetMetric: MlTargetMetricSchema.default('views'),
  horizonDays: z.number().int().min(1).max(90).default(7),
});

export type MlRunBaselineInputDTO = z.infer<typeof MlRunBaselineInputDTOSchema>;

export const MlModelMetricsDTOSchema = z.object({
  mae: z.number().nonnegative(),
  smape: z.number().nonnegative(),
  mase: z.number().nonnegative(),
  sampleSize: z.number().int().nonnegative(),
});

export type MlModelMetricsDTO = z.infer<typeof MlModelMetricsDTOSchema>;

export const MlModelRunSummaryDTOSchema = z.object({
  modelId: z.number().int().positive(),
  modelType: MlModelTypeSchema,
  status: MlModelStatusSchema,
  metrics: MlModelMetricsDTOSchema,
});

export type MlModelRunSummaryDTO = z.infer<typeof MlModelRunSummaryDTOSchema>;

export const MlRunBaselineResultDTOSchema = z.object({
  channelId: z.string(),
  targetMetric: MlTargetMetricSchema,
  status: z.enum(['completed', 'insufficient_data']),
  reason: z.string().nullable(),
  activeModelType: MlModelTypeSchema.nullable(),
  trainedAt: z.iso.datetime().nullable(),
  predictionsGenerated: z.number().int().nonnegative(),
  models: z.array(MlModelRunSummaryDTOSchema),
});

export type MlRunBaselineResultDTO = z.infer<typeof MlRunBaselineResultDTOSchema>;
export const MlRunBaselineResultSchema = IpcResultSchema(MlRunBaselineResultDTOSchema);
export type MlRunBaselineResult = z.infer<typeof MlRunBaselineResultSchema>;

export const MlForecastQueryInputDTOSchema = z.object({
  channelId: z.string().min(1),
  targetMetric: MlTargetMetricSchema.default('views'),
});

export type MlForecastQueryInputDTO = z.infer<typeof MlForecastQueryInputDTOSchema>;

export const MlForecastPointDTOSchema = z.object({
  date: z.iso.date(),
  horizonDays: z.number().int().positive(),
  predicted: z.number().nonnegative(),
  p10: z.number().nonnegative(),
  p50: z.number().nonnegative(),
  p90: z.number().nonnegative(),
});

export type MlForecastPointDTO = z.infer<typeof MlForecastPointDTOSchema>;

export const MlForecastResultDTOSchema = z.object({
  channelId: z.string(),
  targetMetric: MlTargetMetricSchema,
  modelType: MlModelTypeSchema.nullable(),
  trainedAt: z.iso.datetime().nullable(),
  points: z.array(MlForecastPointDTOSchema),
});

export type MlForecastResultDTO = z.infer<typeof MlForecastResultDTOSchema>;
export const MlForecastResultSchema = IpcResultSchema(MlForecastResultDTOSchema);
export type MlForecastResult = z.infer<typeof MlForecastResultSchema>;

export const ReportDateRangeDTOSchema = z.object({
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  days: z.number().int().positive(),
});

export type ReportDateRangeDTO = z.infer<typeof ReportDateRangeDTOSchema>;

export const ReportTopVideoDTOSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  publishedAt: z.iso.datetime(),
  viewCount: z.number().int().nonnegative(),
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
});

export type ReportTopVideoDTO = z.infer<typeof ReportTopVideoDTOSchema>;

export const ReportInsightSeveritySchema = z.enum(['good', 'neutral', 'warning']);
export type ReportInsightSeverity = z.infer<typeof ReportInsightSeveritySchema>;

export const ReportInsightDTOSchema = z.object({
  code: z.string(),
  title: z.string(),
  description: z.string(),
  severity: ReportInsightSeveritySchema,
});

export type ReportInsightDTO = z.infer<typeof ReportInsightDTOSchema>;

export const ReportChannelSummaryDTOSchema = z.object({
  channelId: z.string(),
  name: z.string(),
});

export type ReportChannelSummaryDTO = z.infer<typeof ReportChannelSummaryDTOSchema>;

export const ReportGenerateInputDTOSchema = z.object({
  channelId: z.string().min(1),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  targetMetric: MlTargetMetricSchema.default('views'),
});

export type ReportGenerateInputDTO = z.infer<typeof ReportGenerateInputDTOSchema>;

export const ReportGenerateResultDTOSchema = z.object({
  generatedAt: z.iso.datetime(),
  channel: ReportChannelSummaryDTOSchema,
  range: ReportDateRangeDTOSchema,
  kpis: KpiResultDTOSchema,
  timeseries: TimeseriesResultDTOSchema,
  forecast: MlForecastResultDTOSchema,
  topVideos: z.array(ReportTopVideoDTOSchema),
  insights: z.array(ReportInsightDTOSchema),
});

export type ReportGenerateResultDTO = z.infer<typeof ReportGenerateResultDTOSchema>;
export const ReportGenerateResultSchema = IpcResultSchema(ReportGenerateResultDTOSchema);
export type ReportGenerateResult = z.infer<typeof ReportGenerateResultSchema>;

export const ReportExportFormatSchema = z.enum(['json', 'csv', 'html']);
export type ReportExportFormat = z.infer<typeof ReportExportFormatSchema>;

export const ReportExportInputDTOSchema = z.object({
  channelId: z.string().min(1),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  targetMetric: MlTargetMetricSchema.default('views'),
  exportDir: z.string().min(1).nullable().optional(),
  formats: z.array(ReportExportFormatSchema).min(1).default(['json', 'csv']),
});

export type ReportExportInputDTO = z.infer<typeof ReportExportInputDTOSchema>;

export const ReportExportedFileDTOSchema = z.object({
  kind: z.string(),
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});

export type ReportExportedFileDTO = z.infer<typeof ReportExportedFileDTOSchema>;

export const ReportExportResultDTOSchema = z.object({
  generatedAt: z.iso.datetime(),
  exportDir: z.string(),
  files: z.array(ReportExportedFileDTOSchema),
});

export type ReportExportResultDTO = z.infer<typeof ReportExportResultDTOSchema>;
export const ReportExportResultSchema = IpcResultSchema(ReportExportResultDTOSchema);
export type ReportExportResult = z.infer<typeof ReportExportResultSchema>;

export const ProfileSummaryDTOSchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ProfileSummaryDTO = z.infer<typeof ProfileSummaryDTOSchema>;

export const ProfileListResultDTOSchema = z.object({
  activeProfileId: z.string().nullable(),
  profiles: z.array(ProfileSummaryDTOSchema),
});

export type ProfileListResultDTO = z.infer<typeof ProfileListResultDTOSchema>;
export const ProfileListResultSchema = IpcResultSchema(ProfileListResultDTOSchema);
export type ProfileListResult = z.infer<typeof ProfileListResultSchema>;

export const ProfileCreateInputDTOSchema = z.object({
  name: z.string().min(1).max(100),
  setActive: z.boolean().default(true),
});

export type ProfileCreateInputDTO = z.infer<typeof ProfileCreateInputDTOSchema>;

export const ProfileSetActiveInputDTOSchema = z.object({
  profileId: z.string().min(1),
});

export type ProfileSetActiveInputDTO = z.infer<typeof ProfileSetActiveInputDTOSchema>;

export const ProfileDefaultDatePresetSchema = z.enum(['7d', '30d', '90d']);
export type ProfileDefaultDatePreset = z.infer<typeof ProfileDefaultDatePresetSchema>;

export const ProfileSettingsDTOSchema = z.object({
  defaultChannelId: z.string().min(1).default('UC-SEED-PL-001'),
  preferredForecastMetric: MlTargetMetricSchema.default('views'),
  defaultDatePreset: ProfileDefaultDatePresetSchema.default('30d'),
  autoRunSync: z.boolean().default(false),
  autoRunMl: z.boolean().default(false),
  reportFormats: z.array(ReportExportFormatSchema).min(1).default(['json', 'csv', 'html']),
  language: z.literal('pl').default('pl'),
});

export type ProfileSettingsDTO = z.infer<typeof ProfileSettingsDTOSchema>;
export const ProfileSettingsResultSchema = IpcResultSchema(ProfileSettingsDTOSchema);
export type ProfileSettingsResult = z.infer<typeof ProfileSettingsResultSchema>;

export const SettingsUpdateInputDTOSchema = z.object({
  settings: ProfileSettingsDTOSchema.partial().refine(
    (value) => Object.keys(value).length > 0,
    'Przekazano pusty patch ustawien.',
  ),
});

export type SettingsUpdateInputDTO = z.infer<typeof SettingsUpdateInputDTOSchema>;

export const AuthProviderSchema = z.enum(['youtube']);
export type AuthProvider = z.infer<typeof AuthProviderSchema>;

export const AuthStatusDTOSchema = z.object({
  connected: z.boolean(),
  provider: AuthProviderSchema.nullable(),
  accountLabel: z.string().nullable(),
  connectedAt: z.iso.datetime().nullable(),
  storage: z.literal('safeStorage'),
});

export type AuthStatusDTO = z.infer<typeof AuthStatusDTOSchema>;
export const AuthStatusResultSchema = IpcResultSchema(AuthStatusDTOSchema);
export type AuthStatusResult = z.infer<typeof AuthStatusResultSchema>;

export const AuthConnectInputDTOSchema = z.object({
  provider: AuthProviderSchema.default('youtube'),
  accountLabel: z.string().min(1).max(200),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).nullable().optional(),
});

export type AuthConnectInputDTO = z.infer<typeof AuthConnectInputDTOSchema>;

export const IPC_CHANNELS = {
  APP_GET_STATUS: 'app:getStatus',
  APP_GET_DATA_MODE: 'app:getDataMode',
  APP_SET_DATA_MODE: 'app:setDataMode',
  APP_PROBE_DATA_MODE: 'app:probeDataMode',
  PROFILE_LIST: 'profile:list',
  PROFILE_CREATE: 'profile:create',
  PROFILE_SET_ACTIVE: 'profile:setActive',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  AUTH_GET_STATUS: 'auth:getStatus',
  AUTH_CONNECT: 'auth:connect',
  AUTH_DISCONNECT: 'auth:disconnect',
  SYNC_START: 'sync:start',
  SYNC_RESUME: 'sync:resume',
  ML_RUN_BASELINE: 'ml:runBaseline',
  ML_GET_FORECAST: 'ml:getForecast',
  REPORTS_GENERATE: 'reports:generate',
  REPORTS_EXPORT: 'reports:export',
  DB_GET_KPIS: 'db:getKpis',
  DB_GET_TIMESERIES: 'db:getTimeseries',
  DB_GET_CHANNEL_INFO: 'db:getChannelInfo',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const IPC_EVENTS = {
  SYNC_PROGRESS: 'sync:progress',
  SYNC_COMPLETE: 'sync:complete',
  SYNC_ERROR: 'sync:error',
} as const;

export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];
