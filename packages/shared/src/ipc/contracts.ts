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

export const MlAnomalyMethodSchema = z.enum(['zscore', 'iqr', 'consensus']);
export type MlAnomalyMethod = z.infer<typeof MlAnomalyMethodSchema>;

export const MlAnomalyConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type MlAnomalyConfidence = z.infer<typeof MlAnomalyConfidenceSchema>;

export const MlAnomalySeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type MlAnomalySeverity = z.infer<typeof MlAnomalySeveritySchema>;

export const MlDetectAnomaliesInputDTOSchema = z.object({
  channelId: z.string().min(1),
  targetMetric: MlTargetMetricSchema.default('views'),
  dateFrom: z.iso.date().nullable().optional(),
  dateTo: z.iso.date().nullable().optional(),
}).refine(
  (value) => {
    if (!value.dateFrom || !value.dateTo) {
      return true;
    }
    return value.dateFrom <= value.dateTo;
  },
  'Data poczatkowa nie moze byc pozniejsza niz koncowa.',
);

export type MlDetectAnomaliesInputDTO = z.infer<typeof MlDetectAnomaliesInputDTOSchema>;

export const MlDetectAnomaliesResultDTOSchema = z.object({
  channelId: z.string(),
  targetMetric: MlTargetMetricSchema,
  analyzedPoints: z.number().int().nonnegative(),
  anomaliesDetected: z.number().int().nonnegative(),
  changePointsDetected: z.number().int().nonnegative(),
  generatedAt: z.iso.datetime(),
});

export type MlDetectAnomaliesResultDTO = z.infer<typeof MlDetectAnomaliesResultDTOSchema>;
export const MlDetectAnomaliesResultSchema = IpcResultSchema(MlDetectAnomaliesResultDTOSchema);
export type MlDetectAnomaliesResult = z.infer<typeof MlDetectAnomaliesResultSchema>;

export const MlAnomalyQueryInputDTOSchema = z.object({
  channelId: z.string().min(1),
  targetMetric: MlTargetMetricSchema.default('views'),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  severities: z.array(MlAnomalySeveritySchema).optional(),
}).refine((value) => value.dateFrom <= value.dateTo, 'Data poczatkowa nie moze byc pozniejsza niz koncowa.');

export type MlAnomalyQueryInputDTO = z.infer<typeof MlAnomalyQueryInputDTOSchema>;

export const MlAnomalyItemDTOSchema = z.object({
  id: z.number().int().positive(),
  channelId: z.string(),
  targetMetric: MlTargetMetricSchema,
  date: z.iso.date(),
  value: z.number().nonnegative(),
  baseline: z.number().nonnegative(),
  deviationRatio: z.number(),
  zScore: z.number().nullable(),
  method: MlAnomalyMethodSchema,
  confidence: MlAnomalyConfidenceSchema,
  severity: MlAnomalySeveritySchema,
  explanation: z.string(),
  detectedAt: z.iso.datetime(),
});

export type MlAnomalyItemDTO = z.infer<typeof MlAnomalyItemDTOSchema>;

export const MlAnomalyListResultDTOSchema = z.object({
  channelId: z.string(),
  targetMetric: MlTargetMetricSchema,
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  total: z.number().int().nonnegative(),
  items: z.array(MlAnomalyItemDTOSchema),
});

export type MlAnomalyListResultDTO = z.infer<typeof MlAnomalyListResultDTOSchema>;
export const MlAnomalyListResultSchema = IpcResultSchema(MlAnomalyListResultDTOSchema);
export type MlAnomalyListResult = z.infer<typeof MlAnomalyListResultSchema>;

export const MlTrendDirectionSchema = z.enum(['up', 'down', 'flat']);
export type MlTrendDirection = z.infer<typeof MlTrendDirectionSchema>;

export const MlTrendQueryInputDTOSchema = z.object({
  channelId: z.string().min(1),
  targetMetric: MlTargetMetricSchema.default('views'),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  seasonalityPeriodDays: z.number().int().min(2).max(30).default(7),
}).refine((value) => value.dateFrom <= value.dateTo, 'Data poczatkowa nie moze byc pozniejsza niz koncowa.');

export type MlTrendQueryInputDTO = z.infer<typeof MlTrendQueryInputDTOSchema>;

export const MlTrendPointDTOSchema = z.object({
  date: z.iso.date(),
  value: z.number().nonnegative(),
  trend: z.number(),
  seasonal: z.number(),
  residual: z.number(),
  isChangePoint: z.boolean(),
});

export type MlTrendPointDTO = z.infer<typeof MlTrendPointDTOSchema>;

export const MlChangePointDTOSchema = z.object({
  date: z.iso.date(),
  direction: z.enum(['up', 'down']),
  magnitude: z.number(),
  score: z.number().nonnegative(),
});

export type MlChangePointDTO = z.infer<typeof MlChangePointDTOSchema>;

export const MlTrendResultDTOSchema = z.object({
  channelId: z.string(),
  targetMetric: MlTargetMetricSchema,
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  seasonalityPeriodDays: z.number().int().min(2).max(30),
  summary: z.object({
    trendDirection: MlTrendDirectionSchema,
    trendDelta: z.number(),
  }),
  points: z.array(MlTrendPointDTOSchema),
  changePoints: z.array(MlChangePointDTOSchema),
});

export type MlTrendResultDTO = z.infer<typeof MlTrendResultDTOSchema>;
export const MlTrendResultSchema = IpcResultSchema(MlTrendResultDTOSchema);
export type MlTrendResult = z.infer<typeof MlTrendResultSchema>;

export const QualityScoreConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type QualityScoreConfidence = z.infer<typeof QualityScoreConfidenceSchema>;

export const QualityScoreQueryInputDTOSchema = z.object({
  channelId: z.string().min(1),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  limit: z.number().int().min(1).max(200).default(20),
}).refine((value) => value.dateFrom <= value.dateTo, 'Data poczatkowa nie moze byc pozniejsza niz koncowa.');

export type QualityScoreQueryInputDTO = z.infer<typeof QualityScoreQueryInputDTOSchema>;

export const QualityScoreComponentsDTOSchema = z.object({
  velocity: z.number().min(0).max(1),
  efficiency: z.number().min(0).max(1),
  engagement: z.number().min(0).max(1),
  retention: z.number().min(0).max(1),
  consistency: z.number().min(0).max(1),
});
export type QualityScoreComponentsDTO = z.infer<typeof QualityScoreComponentsDTOSchema>;

export const QualityScoreRawComponentsDTOSchema = z.object({
  velocity: z.number().nonnegative(),
  efficiency: z.number().nonnegative(),
  engagement: z.number().nonnegative(),
  retention: z.number().nonnegative(),
  consistency: z.number().nonnegative(),
});
export type QualityScoreRawComponentsDTO = z.infer<typeof QualityScoreRawComponentsDTOSchema>;

export const QualityScoreItemDTOSchema = z.object({
  videoId: z.string().min(1),
  channelId: z.string().min(1),
  title: z.string().min(1),
  publishedAt: z.iso.datetime(),
  score: z.number().min(0).max(100),
  confidence: QualityScoreConfidenceSchema,
  daysWithData: z.number().int().nonnegative(),
  components: QualityScoreComponentsDTOSchema,
  rawComponents: QualityScoreRawComponentsDTOSchema,
  calculatedAt: z.iso.datetime(),
});
export type QualityScoreItemDTO = z.infer<typeof QualityScoreItemDTOSchema>;

export const QualityScoreResultDTOSchema = z.object({
  channelId: z.string().min(1),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  total: z.number().int().nonnegative(),
  calculatedAt: z.iso.datetime(),
  items: z.array(QualityScoreItemDTOSchema),
});
export type QualityScoreResultDTO = z.infer<typeof QualityScoreResultDTOSchema>;
export const QualityScoreResultSchema = IpcResultSchema(QualityScoreResultDTOSchema);
export type QualityScoreResult = z.infer<typeof QualityScoreResultSchema>;

export const CompetitorSyncInputDTOSchema = z.object({
  channelId: z.string().min(1),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  competitorCount: z.number().int().min(3).max(20).default(3),
}).refine((value) => value.dateFrom <= value.dateTo, 'Data poczatkowa nie moze byc pozniejsza niz koncowa.');
export type CompetitorSyncInputDTO = z.infer<typeof CompetitorSyncInputDTOSchema>;

export const CompetitorSyncResultDTOSchema = z.object({
  channelId: z.string().min(1),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  competitorsSynced: z.number().int().nonnegative(),
  snapshotsProcessed: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  generatedAt: z.iso.datetime(),
});
export type CompetitorSyncResultDTO = z.infer<typeof CompetitorSyncResultDTOSchema>;
export const CompetitorSyncResultSchema = IpcResultSchema(CompetitorSyncResultDTOSchema);
export type CompetitorSyncResult = z.infer<typeof CompetitorSyncResultSchema>;

export const CompetitorInsightsQueryInputDTOSchema = z.object({
  channelId: z.string().min(1),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  limit: z.number().int().min(1).max(50).default(10),
}).refine((value) => value.dateFrom <= value.dateTo, 'Data poczatkowa nie moze byc pozniejsza niz koncowa.');
export type CompetitorInsightsQueryInputDTO = z.infer<typeof CompetitorInsightsQueryInputDTOSchema>;

export const CompetitorOwnerBenchmarkDTOSchema = z.object({
  totalViews: z.number().nonnegative(),
  avgViewsPerDay: z.number().nonnegative(),
  growthRate: z.number(),
  uploadsPerWeek: z.number().nonnegative(),
});
export type CompetitorOwnerBenchmarkDTO = z.infer<typeof CompetitorOwnerBenchmarkDTOSchema>;

export const CompetitorInsightItemDTOSchema = z.object({
  competitorChannelId: z.string().min(1),
  name: z.string().min(1),
  handle: z.string().min(1).nullable(),
  daysWithData: z.number().int().nonnegative(),
  totalViews: z.number().nonnegative(),
  avgViewsPerDay: z.number().nonnegative(),
  marketShare: z.number().min(0).max(1),
  relativeGrowth: z.number(),
  uploadsPerWeek: z.number().nonnegative(),
  uploadFrequencyDelta: z.number(),
  momentumScore: z.number().min(0).max(100),
  hitCount: z.number().int().nonnegative(),
  lastHitDate: z.iso.date().nullable(),
});
export type CompetitorInsightItemDTO = z.infer<typeof CompetitorInsightItemDTOSchema>;

export const CompetitorHitDTOSchema = z.object({
  competitorChannelId: z.string().min(1),
  competitorName: z.string().min(1),
  date: z.iso.date(),
  views: z.number().nonnegative(),
  threshold: z.number().nonnegative(),
  zScore: z.number().nonnegative(),
});
export type CompetitorHitDTO = z.infer<typeof CompetitorHitDTOSchema>;

export const CompetitorInsightsResultDTOSchema = z.object({
  channelId: z.string().min(1),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  totalCompetitors: z.number().int().nonnegative(),
  generatedAt: z.iso.datetime(),
  ownerBenchmark: CompetitorOwnerBenchmarkDTOSchema,
  items: z.array(CompetitorInsightItemDTOSchema),
  hits: z.array(CompetitorHitDTOSchema),
});
export type CompetitorInsightsResultDTO = z.infer<typeof CompetitorInsightsResultDTOSchema>;
export const CompetitorInsightsResultSchema = IpcResultSchema(CompetitorInsightsResultDTOSchema);
export type CompetitorInsightsResult = z.infer<typeof CompetitorInsightsResultSchema>;

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

export const CsvDelimiterSchema = z.enum(['auto', 'comma', 'semicolon', 'tab']);
export type CsvDelimiter = z.infer<typeof CsvDelimiterSchema>;

export const CsvImportColumnMappingDTOSchema = z.object({
  date: z.string().min(1),
  views: z.string().min(1),
  subscribers: z.string().min(1),
  videos: z.string().min(1),
  likes: z.string().min(1).optional(),
  comments: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  transcript: z.string().min(1).optional(),
  videoId: z.string().min(1).optional(),
  publishedAt: z.string().min(1).optional(),
});

export type CsvImportColumnMappingDTO = z.infer<typeof CsvImportColumnMappingDTOSchema>;

export const CsvImportPreviewInputDTOSchema = z.object({
  channelId: z.string().min(1),
  sourceName: z.string().min(1).max(200).default('manual-csv'),
  csvText: z.string().min(1),
  delimiter: CsvDelimiterSchema.default('auto'),
  hasHeader: z.boolean().default(true),
  previewRowsLimit: z.number().int().min(1).max(50).default(10),
});

export type CsvImportPreviewInputDTO = z.infer<typeof CsvImportPreviewInputDTOSchema>;

export const CsvDetectedDelimiterSchema = z.enum(['comma', 'semicolon', 'tab']);
export type CsvDetectedDelimiter = z.infer<typeof CsvDetectedDelimiterSchema>;

export const CsvImportPreviewRowDTOSchema = z.record(z.string(), z.string());
export type CsvImportPreviewRowDTO = z.infer<typeof CsvImportPreviewRowDTOSchema>;

export const CsvImportPreviewResultDTOSchema = z.object({
  channelId: z.string(),
  sourceName: z.string(),
  detectedDelimiter: CsvDetectedDelimiterSchema,
  headers: z.array(z.string()).min(1),
  rowsTotal: z.number().int().nonnegative(),
  sampleRows: z.array(CsvImportPreviewRowDTOSchema),
  suggestedMapping: CsvImportColumnMappingDTOSchema.partial(),
});

export type CsvImportPreviewResultDTO = z.infer<typeof CsvImportPreviewResultDTOSchema>;
export const CsvImportPreviewResultSchema = IpcResultSchema(CsvImportPreviewResultDTOSchema);
export type CsvImportPreviewResult = z.infer<typeof CsvImportPreviewResultSchema>;

export const CsvImportValidationIssueDTOSchema = z.object({
  rowNumber: z.number().int().positive(),
  column: z.string().min(1),
  code: z.string().min(1),
  message: z.string().min(1),
  value: z.string().nullable(),
});

export type CsvImportValidationIssueDTO = z.infer<typeof CsvImportValidationIssueDTOSchema>;

export const CsvImportRunInputDTOSchema = z.object({
  channelId: z.string().min(1),
  sourceName: z.string().min(1).max(200).default('manual-csv'),
  csvText: z.string().min(1),
  delimiter: CsvDelimiterSchema.default('auto'),
  hasHeader: z.boolean().default(true),
  mapping: CsvImportColumnMappingDTOSchema,
});

export type CsvImportRunInputDTO = z.infer<typeof CsvImportRunInputDTOSchema>;

export const CsvImportRunResultDTOSchema = z.object({
  importId: z.number().int().positive(),
  channelId: z.string(),
  sourceName: z.string(),
  rowsTotal: z.number().int().nonnegative(),
  rowsValid: z.number().int().nonnegative(),
  rowsInvalid: z.number().int().nonnegative(),
  importedDateFrom: z.iso.date().nullable(),
  importedDateTo: z.iso.date().nullable(),
  pipelineFeatures: z.number().int().nonnegative(),
  latestFeatureDate: z.iso.date().nullable(),
  validationIssues: z.array(CsvImportValidationIssueDTOSchema),
});

export type CsvImportRunResultDTO = z.infer<typeof CsvImportRunResultDTOSchema>;
export const CsvImportRunResultSchema = IpcResultSchema(CsvImportRunResultDTOSchema);
export type CsvImportRunResult = z.infer<typeof CsvImportRunResultSchema>;

export const SearchContentInputDTOSchema = z.object({
  channelId: z.string().min(1),
  query: z.string().min(2).max(200),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export type SearchContentInputDTO = z.infer<typeof SearchContentInputDTOSchema>;

export const SearchContentSourceSchema = z.enum(['title', 'description', 'transcript']);
export type SearchContentSource = z.infer<typeof SearchContentSourceSchema>;

export const SearchContentItemDTOSchema = z.object({
  documentId: z.string(),
  videoId: z.string().nullable(),
  title: z.string(),
  publishedAt: z.iso.datetime().nullable(),
  snippet: z.string(),
  source: SearchContentSourceSchema,
  score: z.number(),
});

export type SearchContentItemDTO = z.infer<typeof SearchContentItemDTOSchema>;

export const SearchContentResultDTOSchema = z.object({
  channelId: z.string(),
  query: z.string(),
  total: z.number().int().nonnegative(),
  items: z.array(SearchContentItemDTOSchema),
});

export type SearchContentResultDTO = z.infer<typeof SearchContentResultDTOSchema>;
export const SearchContentResultSchema = IpcResultSchema(SearchContentResultDTOSchema);
export type SearchContentResult = z.infer<typeof SearchContentResultSchema>;

export const AssistantConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type AssistantConfidence = z.infer<typeof AssistantConfidenceSchema>;

export const AssistantToolNameSchema = z.enum([
  'read_channel_info',
  'read_kpis',
  'read_top_videos',
  'read_anomalies',
]);
export type AssistantToolName = z.infer<typeof AssistantToolNameSchema>;

export const AssistantEvidenceItemDTOSchema = z.object({
  evidenceId: z.string().min(1),
  tool: AssistantToolNameSchema,
  label: z.string().min(1),
  value: z.string().min(1),
  sourceTable: z.string().min(1),
  sourceRecordId: z.string().min(1),
});
export type AssistantEvidenceItemDTO = z.infer<typeof AssistantEvidenceItemDTOSchema>;

export const AssistantAskInputDTOSchema = z.object({
  threadId: z.string().min(1).nullable().optional(),
  channelId: z.string().min(1),
  question: z.string().min(3).max(2000),
  dateFrom: z.iso.date().nullable().optional(),
  dateTo: z.iso.date().nullable().optional(),
  targetMetric: MlTargetMetricSchema.default('views'),
}).refine(
  (value) => {
    if (!value.dateFrom || !value.dateTo) {
      return true;
    }
    return value.dateFrom <= value.dateTo;
  },
  'Data poczatkowa nie moze byc pozniejsza niz koncowa.',
);
export type AssistantAskInputDTO = z.infer<typeof AssistantAskInputDTOSchema>;

export const AssistantAskResultDTOSchema = z.object({
  threadId: z.string().min(1),
  messageId: z.number().int().positive(),
  answer: z.string().min(1),
  confidence: AssistantConfidenceSchema,
  followUpQuestions: z.array(z.string().min(1)),
  evidence: z.array(AssistantEvidenceItemDTOSchema),
  usedStub: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type AssistantAskResultDTO = z.infer<typeof AssistantAskResultDTOSchema>;
export const AssistantAskResultSchema = IpcResultSchema(AssistantAskResultDTOSchema);
export type AssistantAskResult = z.infer<typeof AssistantAskResultSchema>;

export const AssistantThreadListInputDTOSchema = z.object({
  channelId: z.string().min(1).nullable().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
export type AssistantThreadListInputDTO = z.infer<typeof AssistantThreadListInputDTOSchema>;

export const AssistantThreadSummaryDTOSchema = z.object({
  threadId: z.string().min(1),
  channelId: z.string().min(1),
  title: z.string().min(1),
  lastQuestion: z.string().min(1).nullable(),
  updatedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type AssistantThreadSummaryDTO = z.infer<typeof AssistantThreadSummaryDTOSchema>;

export const AssistantThreadListResultDTOSchema = z.object({
  items: z.array(AssistantThreadSummaryDTOSchema),
});
export type AssistantThreadListResultDTO = z.infer<typeof AssistantThreadListResultDTOSchema>;
export const AssistantThreadListResultSchema = IpcResultSchema(AssistantThreadListResultDTOSchema);
export type AssistantThreadListResult = z.infer<typeof AssistantThreadListResultSchema>;

export const AssistantThreadMessagesInputDTOSchema = z.object({
  threadId: z.string().min(1),
});
export type AssistantThreadMessagesInputDTO = z.infer<typeof AssistantThreadMessagesInputDTOSchema>;

export const AssistantMessageRoleSchema = z.enum(['user', 'assistant']);
export type AssistantMessageRole = z.infer<typeof AssistantMessageRoleSchema>;

export const AssistantMessageDTOSchema = z.object({
  messageId: z.number().int().positive(),
  threadId: z.string().min(1),
  role: AssistantMessageRoleSchema,
  text: z.string().min(1),
  confidence: AssistantConfidenceSchema.nullable(),
  followUpQuestions: z.array(z.string().min(1)),
  evidence: z.array(AssistantEvidenceItemDTOSchema),
  createdAt: z.iso.datetime(),
});
export type AssistantMessageDTO = z.infer<typeof AssistantMessageDTOSchema>;

export const AssistantThreadMessagesResultDTOSchema = z.object({
  threadId: z.string().min(1),
  channelId: z.string().min(1),
  title: z.string().min(1),
  messages: z.array(AssistantMessageDTOSchema),
});
export type AssistantThreadMessagesResultDTO = z.infer<typeof AssistantThreadMessagesResultDTOSchema>;
export const AssistantThreadMessagesResultSchema = IpcResultSchema(AssistantThreadMessagesResultDTOSchema);
export type AssistantThreadMessagesResult = z.infer<typeof AssistantThreadMessagesResultSchema>;

export const IPC_CHANNELS = {
  APP_GET_STATUS: 'app:getStatus',
  APP_GET_DATA_MODE: 'app:getDataMode',
  APP_SET_DATA_MODE: 'app:setDataMode',
  APP_PROBE_DATA_MODE: 'app:probeDataMode',
  IMPORT_CSV_PREVIEW: 'import:previewCsv',
  IMPORT_CSV_RUN: 'import:runCsv',
  SEARCH_CONTENT: 'search:content',
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
  ML_DETECT_ANOMALIES: 'ml:detectAnomalies',
  ML_GET_ANOMALIES: 'ml:getAnomalies',
  ML_GET_TREND: 'ml:getTrend',
  REPORTS_GENERATE: 'reports:generate',
  REPORTS_EXPORT: 'reports:export',
  ANALYTICS_GET_QUALITY_SCORES: 'analytics:getQualityScores',
  ANALYTICS_SYNC_COMPETITORS: 'analytics:syncCompetitors',
  ANALYTICS_GET_COMPETITOR_INSIGHTS: 'analytics:getCompetitorInsights',
  DB_GET_KPIS: 'db:getKpis',
  DB_GET_TIMESERIES: 'db:getTimeseries',
  DB_GET_CHANNEL_INFO: 'db:getChannelInfo',
  ASSISTANT_ASK: 'assistant:ask',
  ASSISTANT_LIST_THREADS: 'assistant:listThreads',
  ASSISTANT_GET_THREAD_MESSAGES: 'assistant:getThreadMessages',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const IPC_EVENTS = {
  SYNC_PROGRESS: 'sync:progress',
  SYNC_COMPLETE: 'sync:complete',
  SYNC_ERROR: 'sync:error',
} as const;

export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];
