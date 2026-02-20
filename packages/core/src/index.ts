// Database
export {
  createDatabaseConnection,
  closeDatabaseConnection,
  type CreateDatabaseInput,
  type DatabaseConnection,
} from './database.ts';

// Migrations
export {
  MIGRATIONS,
  runMigrations,
  type MigrationDefinition,
  type RunMigrationsResult,
} from './migrations/index.ts';

// Repositories (mutation layer)
export {
  createCoreRepository,
  type CoreRepository,
} from './repositories/core-repository.ts';
export {
  createMlRepository,
  type MlRepository,
} from './repositories/ml-repository.ts';
export {
  createAssistantRepository,
  type AssistantRepository,
} from './repositories/assistant-repository.ts';
export {
  createCompetitorRepository,
  type CompetitorRepository,
} from './repositories/competitor-repository.ts';
export {
  createPlanningRepository,
  type PlanningRepository,
} from './repositories/planning-repository.ts';
export {
  createQualityRepository,
  type QualityRepository,
} from './repositories/quality-repository.ts';
export {
  createTopicRepository,
  type TopicRepository,
} from './repositories/topic-repository.ts';
export {
  createPipelineRepository,
  type PipelineRepository,
} from './repositories/pipeline-repository.ts';
export type {
  AppMetaEntryInput,
  ChannelSnapshotRecord,
  CreateSyncRunInput,
  GetChannelSnapshotInput,
  FinishSyncRunInput,
  GetLatestOpenSyncRunInput,
  GetPersistedSyncBatchInput,
  GetSyncRunByIdInput,
  GetVideoSnapshotsInput,
  RawApiResponseInput,
  ResumeSyncRunInput,
  SyncRunRecord,
  UpdateSyncRunCheckpointInput,
  UpsertChannelDayInput,
  UpsertChannelInput,
  UpsertProfileInput,
  UpsertVideoDayInput,
  UpsertVideoInput,
  VideoSnapshotRecord,
} from './repositories/types.ts';

// Queries
export {
  createMetricsQueries,
  type MetricsQueries,
} from './queries/metrics-queries.ts';
export {
  createChannelQueries,
  type ChannelQueries,
} from './queries/channel-queries.ts';
export {
  createSettingsQueries,
  type SettingsQueries,
} from './queries/settings-queries.ts';
export {
  createImportSearchQueries,
  type ImportSearchQueries,
  type CsvImportPersistResult,
} from './queries/import-search-queries.ts';
export {
  createAppStatusQueries,
  type AppStatusQueries,
} from './queries/app-status-queries.ts';
export {
  createMlQueries,
  type MlQueries,
  type MlSeriesPointRow,
  type MlActiveForecastModelRow,
  type MlForecastPredictionRow,
} from './queries/ml-queries.ts';
export {
  createAssistantQueries,
  type AssistantQueries,
  type AssistantChannelInfoRow,
  type AssistantTopVideoRow,
  type AssistantAnomalyRow,
  type AssistantThreadRow,
  type AssistantThreadListRow,
  type AssistantMessageRow,
  type AssistantMessageEvidenceBatchRow,
} from './queries/assistant-queries.ts';
export {
  createCompetitorQueries,
  type CompetitorQueries,
  type CompetitorOwnerDayRow,
  type CompetitorSnapshotRow,
  type CompetitorPersistedSnapshotRow,
} from './queries/competitor-queries.ts';
export {
  createPlanningQueries,
  type PlanningQueries,
  type PlanningPlanHeaderRow,
  type PlanningRecommendationRow,
} from './queries/planning-queries.ts';
export {
  createQualityQueries,
  type QualityQueries,
  type QualityVideoAggregateRow,
} from './queries/quality-queries.ts';
export {
  createTopicQueries,
  type TopicQueries,
  type TopicVideoAggregateRow,
  type TopicVideoDayRow,
  type TopicCompetitorSummaryRow,
  type TopicPersistedClusterRow,
  type TopicPersistedGapRow,
} from './queries/topic-queries.ts';
export {
  createPipelineQueries,
  type PipelineQueries,
  type PipelineChannelWarehouseRow,
  type PipelineVideoWarehouseRow,
  type PipelineChannelDayWarehouseRow,
} from './queries/pipeline-queries.ts';

// Fixtures
export {
  loadSeedFixtureFromFile,
  seedDatabaseFromFixture,
  type SeedFixture,
  type SeedDatabaseResult,
} from './fixtures/index.ts';

// Semantic layer
export {
  createSemanticMetricService,
  getSemanticMetricCatalog,
  type ReadSemanticMetricValueInput,
  type ReadSemanticMetricValuesInput,
  type SemanticMetricDefinition,
  type SemanticMetricId,
  type SemanticMetricService,
} from './semantic/index.ts';

// Observability
export {
  runWithAnalyticsTrace,
  type AnalyticsTraceLineageInput,
  type RunWithAnalyticsTraceInput,
} from './observability/analytics-tracing.ts';
export {
  createAnalyticsQueryCache,
  type AnalyticsQueryCache,
  type CachedQueryInput,
  type InvalidateAnalyticsCacheResult,
  type AnalyticsPerformanceSnapshot,
  type AnalyticsCacheMetricStats,
  type AnalyticsOperationLatencyStats,
} from './observability/analytics-query-cache.ts';
