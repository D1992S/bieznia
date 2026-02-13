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
export type {
  AppMetaEntryInput,
  ChannelSnapshotRecord,
  CreateSyncRunInput,
  GetChannelSnapshotInput,
  FinishSyncRunInput,
  GetLatestOpenSyncRunInput,
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

// Fixtures
export {
  loadSeedFixtureFromFile,
  seedDatabaseFromFixture,
  type SeedFixture,
  type SeedDatabaseResult,
} from './fixtures/index.ts';
