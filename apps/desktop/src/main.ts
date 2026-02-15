import {
  createChannelQueries,
  createCoreRepository,
  createDatabaseConnection,
  createMetricsQueries,
  createSettingsQueries,
  runMigrations,
  type ChannelQueries,
  type DatabaseConnection,
  type MetricsQueries,
  type SettingsQueries,
} from '@moze/core';
import { getLatestMlForecast, runMlBaseline } from '@moze/ml';
import { exportDashboardReport, generateDashboardReport } from '@moze/reports';
import {
  createCachedDataProvider,
  createDataModeManager,
  createFakeDataProvider,
  createRateLimitedDataProvider,
  createRealDataProvider,
  createRecordingDataProvider,
  createSyncOrchestrator,
  type DataModeManager,
  type SyncOrchestrator,
} from '@moze/sync';
import {
  AppError,
  IPC_EVENTS,
  createLogger,
  err,
  ok,
  type AppStatusDTO,
  type AuthConnectInputDTO,
  type AuthStatusDTO,
  type DataModeProbeInputDTO,
  type DataModeProbeResultDTO,
  type DataModeStatusDTO,
  type KpiQueryDTO,
  type KpiResultDTO,
  type MlForecastQueryInputDTO,
  type MlForecastResultDTO,
  type MlRunBaselineInputDTO,
  type MlRunBaselineResultDTO,
  type ProfileCreateInputDTO,
  type ProfileListResultDTO,
  type ProfileSetActiveInputDTO,
  type ProfileSettingsDTO,
  type ProfileSummaryDTO,
  type ReportExportInputDTO,
  type ReportExportResultDTO,
  type ReportGenerateInputDTO,
  type ReportGenerateResultDTO,
  type Result,
  type SettingsUpdateInputDTO,
  type SetDataModeInputDTO,
  type SyncCommandResultDTO,
  type SyncResumeInputDTO,
  type SyncStartInputDTO,
  type TimeseriesQueryDTO,
  type TimeseriesResultDTO,
} from '@moze/shared';
import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createProfileManager,
  type ProfileManager,
  type SecretCryptoAdapter,
} from './profile-manager.js';
import { registerIpcHandlers, type DesktopIpcBackend } from './ipc-handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createLogger({ baseContext: { module: 'desktop-main' } });

const IS_DEV = process.env.NODE_ENV !== 'production';
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
const UI_ENTRY_PATH = path.join(__dirname, '../../ui/dist/index.html');
const REPO_ROOT_PATH = path.resolve(__dirname, '../../..');
const PROFILE_RUNTIME_DIRNAME = 'profiles-runtime';
const DEFAULT_FAKE_FIXTURE_PATH = path.join(REPO_ROOT_PATH, 'fixtures', 'seed-data.json');
const DEFAULT_RECORDING_PATH = path.join(REPO_ROOT_PATH, 'fixtures', 'recordings', 'latest-provider-recording.json');

interface BackendState {
  connection: DatabaseConnection | null;
  metricsQueries: MetricsQueries | null;
  channelQueries: ChannelQueries | null;
  settingsQueries: SettingsQueries | null;
  dataModeManager: DataModeManager | null;
  syncOrchestrator: SyncOrchestrator | null;
  profileManager: ProfileManager | null;
  dbPath: string | null;
}

const backendState: BackendState = {
  connection: null,
  metricsQueries: null,
  channelQueries: null,
  settingsQueries: null,
  dataModeManager: null,
  syncOrchestrator: null,
  profileManager: null,
  dbPath: null,
};

let mainWindow: BrowserWindow | null = null;

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function normalizeIsoDateTime(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value.includes('T')) {
    return value;
  }

  return `${value.replace(' ', 'T')}Z`;
}

function emitSyncEvent(eventName: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(eventName, payload);
}

function createDbNotReadyError(): AppError {
  return AppError.create(
    'APP_DB_NOT_READY',
    'Baza danych nie jest gotowa. Uruchom ponownie aplikacje.',
    'error',
    { dbPath: backendState.dbPath },
  );
}

function createDataModeNotReadyError(): AppError {
  return AppError.create(
    'APP_DATA_MODE_NOT_READY',
    'Tryb danych nie jest gotowy. Uruchom ponownie aplikacje.',
    'error',
    {},
  );
}

function createSyncNotReadyError(): AppError {
  return AppError.create(
    'APP_SYNC_NOT_READY',
    'Orkiestrator synchronizacji nie jest gotowy. Uruchom ponownie aplikacje.',
    'error',
    {},
  );
}

function createProfileReloadFailedError(details: Record<string, unknown>): AppError {
  return AppError.create(
    'APP_PROFILE_RELOAD_FAILED',
    'Nie udalo sie przelaczyc aktywnego profilu.',
    'error',
    details,
  );
}

function createProfileSwitchBlockedError(details: Record<string, unknown>): AppError {
  return AppError.create(
    'APP_PROFILE_SWITCH_BLOCKED_SYNC_RUNNING',
    'Nie mozna przelaczyc aktywnego profilu podczas trwajacej synchronizacji.',
    'error',
    details,
  );
}

function resolvePathFromEnv(value: string | undefined, fallbackPath: string): string {
  if (!value) {
    return fallbackPath;
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  return path.join(REPO_ROOT_PATH, value);
}

function createSafeStorageAdapter(): SecretCryptoAdapter {
  return {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (plainText) => safeStorage.encryptString(plainText),
    decryptString: (cipherText) => safeStorage.decryptString(cipherText),
  };
}

function initializeDataModes(): Result<DataModeManager, AppError> {
  const fakeFixturePath = resolvePathFromEnv(process.env.MOZE_FAKE_FIXTURE_PATH, DEFAULT_FAKE_FIXTURE_PATH);
  const realFixturePath = process.env.MOZE_REAL_FIXTURE_PATH
    ? resolvePathFromEnv(process.env.MOZE_REAL_FIXTURE_PATH, DEFAULT_FAKE_FIXTURE_PATH)
    : null;
  const recordingOutputPath = resolvePathFromEnv(process.env.MOZE_RECORDING_OUTPUT_PATH, DEFAULT_RECORDING_PATH);

  const fakeProviderResult = createFakeDataProvider({ fixturePath: fakeFixturePath });
  if (!fakeProviderResult.ok) {
    return err(
      AppError.create(
        'SYNC_FAKE_PROVIDER_INIT_FAILED',
        'Nie udalo sie zainicjalizowac fake provider.',
        'error',
        { fakeFixturePath },
      ),
    );
  }

  const realProviderResult = realFixturePath
    ? createRealDataProvider({
        fixturePath: realFixturePath,
        providerName: 'real-fixture-provider',
      })
    : createRealDataProvider({
        providerName: 'real-provider-unconfigured',
      });
  if (!realProviderResult.ok) {
    return err(
      AppError.create(
        'SYNC_REAL_PROVIDER_INIT_FAILED',
        'Nie udalo sie zainicjalizowac real provider.',
        'error',
        { realFixturePath },
      ),
    );
  }

  const fakeProvider = createRateLimitedDataProvider(
    createCachedDataProvider(fakeProviderResult.value),
    { logger: logger.withContext({ provider: 'fake' }) },
  );
  const realProvider = createRateLimitedDataProvider(
    createCachedDataProvider(realProviderResult.value),
    { logger: logger.withContext({ provider: 'real' }) },
  );
  const recordingProvider = createRecordingDataProvider({
    provider: realProvider,
    outputFilePath: recordingOutputPath,
  });

  const manager = createDataModeManager({
    initialMode: (process.env.MOZE_DATA_MODE as 'fake' | 'real' | 'record' | undefined) ?? 'fake',
    fakeProvider,
    realProvider,
    recordProvider: recordingProvider,
    source: 'desktop-runtime',
    canActivateMode: ({ mode, provider }) => {
      if (mode !== 'real' || provider.requiresAuth !== true) {
        return ok(undefined);
      }

      const profileManagerResult = ensureProfileManager();
      if (!profileManagerResult.ok) {
        return profileManagerResult;
      }

      const authStatusResult = profileManagerResult.value.getAuthStatus();
      if (!authStatusResult.ok) {
        return authStatusResult;
      }

      if (!authStatusResult.value.connected) {
        return err(
          AppError.create(
            'SYNC_REAL_AUTH_REQUIRED',
            'Tryb real wymaga podlaczonego konta YouTube.',
            'error',
            { providerName: provider.name },
          ),
        );
      }

      return ok(undefined);
    },
  });

  logger.info('Data modes gotowe.', {
    fakeFixturePath,
    realFixturePath: realFixturePath ?? 'UNCONFIGURED',
    recordingOutputPath,
    mode: manager.getStatus().mode,
    availableModes: manager.getStatus().availableModes,
  });

  return ok(manager);
}

function resolveProfilesRootDir(): string {
  return path.join(app.getPath('userData'), PROFILE_RUNTIME_DIRNAME);
}

function ensureProfileManager(): Result<ProfileManager, AppError> {
  if (backendState.profileManager) {
    return ok(backendState.profileManager);
  }

  const createResult = createProfileManager({
    rootDir: resolveProfilesRootDir(),
    crypto: createSafeStorageAdapter(),
  });
  if (!createResult.ok) {
    return createResult;
  }

  backendState.profileManager = createResult.value;

  logger.info('Profile manager gotowy.', {
    profilesRootDir: resolveProfilesRootDir(),
  });

  return ok(createResult.value);
}

function syncActiveProfileInDatabase(
  db: DatabaseConnection['db'],
  profile: ProfileSummaryDTO,
): Result<void, AppError> {
  const repository = createCoreRepository(db);

  try {
    db.prepare('UPDATE profiles SET is_active = 0 WHERE is_active <> 0').run();
  } catch (cause) {
    return err(
      AppError.create(
        'DB_PROFILE_DEACTIVATE_FAILED',
        'Nie udalo sie zaktualizowac aktywnego profilu w bazie.',
        'error',
        { profileId: profile.id },
        toError(cause),
      ),
    );
  }

  return repository.upsertProfile({
    id: profile.id,
    name: profile.name,
    isActive: true,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  });
}

function initializeBackend(): Result<void, AppError> {
  if (backendState.connection) {
    return ok(undefined);
  }

  const profileManagerResult = ensureProfileManager();
  if (!profileManagerResult.ok) {
    return profileManagerResult;
  }

  const activeProfileResult = profileManagerResult.value.getActiveProfile();
  if (!activeProfileResult.ok) {
    return activeProfileResult;
  }

  const dbPathResult = profileManagerResult.value.getActiveDbPath();
  if (!dbPathResult.ok) {
    return dbPathResult;
  }

  const connectionResult = createDatabaseConnection({ filename: dbPathResult.value });
  if (!connectionResult.ok) {
    return connectionResult;
  }

  const connection = connectionResult.value;
  const migrationResult = runMigrations(connection.db);
  if (!migrationResult.ok) {
    const closeResult = connection.close();
    if (!closeResult.ok) {
      logger.warning('Nie udalo sie zamknac polaczenia DB po bledzie migracji.', {
        error: closeResult.error.toDTO(),
      });
    }
    return migrationResult;
  }

  const profileSyncResult = syncActiveProfileInDatabase(connection.db, activeProfileResult.value);
  if (!profileSyncResult.ok) {
    const closeResult = connection.close();
    if (!closeResult.ok) {
      logger.warning('Nie udalo sie zamknac polaczenia DB po bledzie sync profilu.', {
        error: closeResult.error.toDTO(),
      });
    }
    return profileSyncResult;
  }

  const metricsQueries = createMetricsQueries(connection.db);
  const channelQueries = createChannelQueries(connection.db);
  const settingsQueries = createSettingsQueries(connection.db);

  const dataModesResult = initializeDataModes();
  if (!dataModesResult.ok) {
    const closeResult = connection.close();
    if (!closeResult.ok) {
      logger.warning('Nie udalo sie zamknac polaczenia DB po bledzie data mode init.', {
        error: closeResult.error.toDTO(),
      });
    }
    return err(dataModesResult.error);
  }

  const syncOrchestrator = createSyncOrchestrator({
    db: connection.db,
    dataModeManager: dataModesResult.value,
    logger: logger.withContext({ module: 'sync-orchestrator' }),
    hooks: {
      onProgress: (event) => {
        emitSyncEvent(IPC_EVENTS.SYNC_PROGRESS, event);
      },
      onComplete: (event) => {
        emitSyncEvent(IPC_EVENTS.SYNC_COMPLETE, event);
      },
      onError: (event) => {
        emitSyncEvent(IPC_EVENTS.SYNC_ERROR, event);
      },
    },
  });

  backendState.connection = connection;
  backendState.metricsQueries = metricsQueries;
  backendState.channelQueries = channelQueries;
  backendState.settingsQueries = settingsQueries;
  backendState.dataModeManager = dataModesResult.value;
  backendState.syncOrchestrator = syncOrchestrator;
  backendState.dbPath = dbPathResult.value;

  logger.info('Backend gotowy.', {
    dbPath: dbPathResult.value,
    activeProfileId: activeProfileResult.value.id,
    migrationsApplied: migrationResult.value.applied.length,
    migrationsAlreadyApplied: migrationResult.value.alreadyApplied.length,
  });

  return ok(undefined);
}

function closeBackend(): void {
  if (backendState.connection) {
    const closeResult = backendState.connection.close();
    if (!closeResult.ok) {
      logger.error('Nie udalo sie zamknac bazy danych.', { error: closeResult.error.toDTO() });
    }
  }

  backendState.connection = null;
  backendState.metricsQueries = null;
  backendState.channelQueries = null;
  backendState.settingsQueries = null;
  backendState.dataModeManager = null;
  backendState.syncOrchestrator = null;
  backendState.dbPath = null;
}

function reloadBackendForActiveProfile(): Result<void, AppError> {
  closeBackend();
  const backendInitResult = initializeBackend();
  if (!backendInitResult.ok) {
    return err(createProfileReloadFailedError({ error: backendInitResult.error.toDTO() }));
  }
  return ok(undefined);
}

function readActiveProfile(): Result<ProfileSummaryDTO, AppError> {
  const profileManagerResult = ensureProfileManager();
  if (!profileManagerResult.ok) {
    return profileManagerResult;
  }
  return profileManagerResult.value.getActiveProfile();
}

function ensureProfileSwitchAllowed(): Result<void, AppError> {
  const db = backendState.connection?.db;
  if (!db) {
    return ok(undefined);
  }

  try {
    const activeRunRow = db
      .prepare<[], { syncRunId: number; stage: string | null }>(
        `
          SELECT
            id AS syncRunId,
            stage
          FROM sync_runs
          WHERE finished_at IS NULL
            AND status = 'running'
          ORDER BY started_at DESC, id DESC
          LIMIT 1
        `,
      )
      .get();

    if (!activeRunRow) {
      return ok(undefined);
    }

    return err(
      createProfileSwitchBlockedError({
        activeSyncRunId: activeRunRow.syncRunId,
        activeSyncStage: activeRunRow.stage ?? null,
      }),
    );
  } catch (cause) {
    return err(
      AppError.create(
        'APP_PROFILE_SWITCH_GUARD_FAILED',
        'Nie udalo sie sprawdzic stanu synchronizacji przed zmiana profilu.',
        'error',
        {},
        toError(cause),
      ),
    );
  }
}

function readAppStatus(): Result<AppStatusDTO, AppError> {
  const activeProfileResult = readActiveProfile();
  if (!activeProfileResult.ok) {
    return activeProfileResult;
  }

  const db = backendState.connection?.db;
  if (!db) {
    return ok({
      version: app.getVersion(),
      dbReady: false,
      profileId: activeProfileResult.value.id,
      syncRunning: false,
      lastSyncAt: null,
    });
  }

  try {
    const latestSyncRunRow = db
      .prepare<[], { status: string; finishedAt: string | null }>(
        `
          SELECT
            status,
            finished_at AS finishedAt
          FROM sync_runs
          ORDER BY started_at DESC, id DESC
          LIMIT 1
        `,
      )
      .get();

    const latestChannelSyncRow = db
      .prepare<[], { lastSyncAt: string }>(
        `
          SELECT last_sync_at AS lastSyncAt
          FROM dim_channel
          WHERE last_sync_at IS NOT NULL
          ORDER BY last_sync_at DESC, channel_id ASC
          LIMIT 1
        `,
      )
      .get();

    let lastSyncAt = normalizeIsoDateTime(latestChannelSyncRow?.lastSyncAt ?? null);
    if (!lastSyncAt) {
      const latestFinishedSyncRunRow = db
        .prepare<[], { finishedAt: string }>(
          `
            SELECT finished_at AS finishedAt
            FROM sync_runs
            WHERE finished_at IS NOT NULL
            ORDER BY finished_at DESC, id DESC
            LIMIT 1
          `,
        )
        .get();

      lastSyncAt = normalizeIsoDateTime(latestFinishedSyncRunRow?.finishedAt ?? null);
    }

    return ok({
      version: app.getVersion(),
      dbReady: true,
      profileId: activeProfileResult.value.id,
      syncRunning: Boolean(latestSyncRunRow && latestSyncRunRow.finishedAt === null),
      lastSyncAt,
    });
  } catch (cause) {
    return err(
      AppError.create(
        'APP_STATUS_READ_FAILED',
        'Nie udalo sie odczytac statusu aplikacji.',
        'error',
        {},
        toError(cause),
      ),
    );
  }
}

function readKpis(query: KpiQueryDTO): Result<KpiResultDTO, AppError> {
  if (!backendState.metricsQueries) {
    return err(createDbNotReadyError());
  }
  return backendState.metricsQueries.getKpis(query);
}

function readTimeseries(query: TimeseriesQueryDTO): Result<TimeseriesResultDTO, AppError> {
  if (!backendState.metricsQueries) {
    return err(createDbNotReadyError());
  }
  return backendState.metricsQueries.getTimeseries(query);
}

function readChannelInfo(query: { channelId: string }) {
  if (!backendState.channelQueries) {
    return err(createDbNotReadyError());
  }
  return backendState.channelQueries.getChannelInfo(query);
}

function readDataModeStatus(): Result<DataModeStatusDTO, AppError> {
  if (!backendState.dataModeManager) {
    return err(createDataModeNotReadyError());
  }
  return ok(backendState.dataModeManager.getStatus());
}

function setDataMode(input: SetDataModeInputDTO): Result<DataModeStatusDTO, AppError> {
  if (!backendState.dataModeManager) {
    return err(createDataModeNotReadyError());
  }
  return backendState.dataModeManager.setMode(input);
}

function probeDataMode(input: DataModeProbeInputDTO): Result<DataModeProbeResultDTO, AppError> {
  if (!backendState.dataModeManager) {
    return err(createDataModeNotReadyError());
  }
  return backendState.dataModeManager.probe(input);
}

function listProfilesCommand(): Result<ProfileListResultDTO, AppError> {
  const profileManagerResult = ensureProfileManager();
  if (!profileManagerResult.ok) {
    return profileManagerResult;
  }
  return profileManagerResult.value.listProfiles();
}

function createProfileCommand(input: ProfileCreateInputDTO): Result<ProfileListResultDTO, AppError> {
  const profileManagerResult = ensureProfileManager();
  if (!profileManagerResult.ok) {
    return profileManagerResult;
  }

  const previousActiveProfileResult = profileManagerResult.value.getActiveProfile();
  if (!previousActiveProfileResult.ok) {
    return previousActiveProfileResult;
  }

  if (input.setActive) {
    const switchGuardResult = ensureProfileSwitchAllowed();
    if (!switchGuardResult.ok) {
      return switchGuardResult;
    }
  }

  const createResult = profileManagerResult.value.createProfile(input);
  if (!createResult.ok) {
    return createResult;
  }

  const previousActiveProfileId = previousActiveProfileResult.value.id;
  const nextActiveProfileId = createResult.value.activeProfileId;

  if (nextActiveProfileId && nextActiveProfileId !== previousActiveProfileId) {
    const reloadResult = reloadBackendForActiveProfile();
    if (!reloadResult.ok) {
      return reloadResult;
    }
  }

  return createResult;
}

function setActiveProfileCommand(input: ProfileSetActiveInputDTO): Result<ProfileListResultDTO, AppError> {
  const profileManagerResult = ensureProfileManager();
  if (!profileManagerResult.ok) {
    return profileManagerResult;
  }

  const previousActiveProfileResult = profileManagerResult.value.getActiveProfile();
  if (!previousActiveProfileResult.ok) {
    return previousActiveProfileResult;
  }

  if (input.profileId !== previousActiveProfileResult.value.id) {
    const switchGuardResult = ensureProfileSwitchAllowed();
    if (!switchGuardResult.ok) {
      return switchGuardResult;
    }
  }

  const setActiveResult = profileManagerResult.value.setActiveProfile(input);
  if (!setActiveResult.ok) {
    return setActiveResult;
  }

  if (setActiveResult.value.activeProfileId !== previousActiveProfileResult.value.id) {
    const reloadResult = reloadBackendForActiveProfile();
    if (!reloadResult.ok) {
      return reloadResult;
    }
  }

  return setActiveResult;
}

function readProfileSettingsCommand(): Result<ProfileSettingsDTO, AppError> {
  if (!backendState.settingsQueries) {
    return err(createDbNotReadyError());
  }
  return backendState.settingsQueries.getProfileSettings();
}

function updateProfileSettingsCommand(input: SettingsUpdateInputDTO): Result<ProfileSettingsDTO, AppError> {
  if (!backendState.settingsQueries) {
    return err(createDbNotReadyError());
  }
  return backendState.settingsQueries.updateProfileSettings(input.settings);
}

function readAuthStatusCommand(): Result<AuthStatusDTO, AppError> {
  const profileManagerResult = ensureProfileManager();
  if (!profileManagerResult.ok) {
    return profileManagerResult;
  }
  return profileManagerResult.value.getAuthStatus();
}

function connectAuthCommand(input: AuthConnectInputDTO): Result<AuthStatusDTO, AppError> {
  const profileManagerResult = ensureProfileManager();
  if (!profileManagerResult.ok) {
    return profileManagerResult;
  }
  return profileManagerResult.value.connectAuth(input);
}

function disconnectAuthCommand(): Result<AuthStatusDTO, AppError> {
  const profileManagerResult = ensureProfileManager();
  if (!profileManagerResult.ok) {
    return profileManagerResult;
  }
  return profileManagerResult.value.disconnectAuth();
}

async function startSync(input: SyncStartInputDTO): Promise<Result<SyncCommandResultDTO, AppError>> {
  if (!backendState.syncOrchestrator) {
    return err(createSyncNotReadyError());
  }

  const activeProfileResult = readActiveProfile();
  if (!activeProfileResult.ok) {
    return err(activeProfileResult.error);
  }

  return backendState.syncOrchestrator.startSync({
    ...input,
    profileId: input.profileId ?? activeProfileResult.value.id,
  });
}

async function resumeSync(input: SyncResumeInputDTO): Promise<Result<SyncCommandResultDTO, AppError>> {
  if (!backendState.syncOrchestrator) {
    return err(createSyncNotReadyError());
  }
  return backendState.syncOrchestrator.resumeSync(input);
}

function runMlBaselineCommand(input: MlRunBaselineInputDTO): Result<MlRunBaselineResultDTO, AppError> {
  const db = backendState.connection?.db;
  if (!db) {
    return err(createDbNotReadyError());
  }

  return runMlBaseline({
    db,
    channelId: input.channelId,
    targetMetric: input.targetMetric,
    horizonDays: input.horizonDays,
  });
}

function getMlForecastCommand(input: MlForecastQueryInputDTO): Result<MlForecastResultDTO, AppError> {
  const db = backendState.connection?.db;
  if (!db) {
    return err(createDbNotReadyError());
  }

  return getLatestMlForecast({
    db,
    channelId: input.channelId,
    targetMetric: input.targetMetric,
  });
}

function generateReportCommand(input: ReportGenerateInputDTO): Result<ReportGenerateResultDTO, AppError> {
  const db = backendState.connection?.db;
  if (!db) {
    return err(createDbNotReadyError());
  }

  return generateDashboardReport({
    db,
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    targetMetric: input.targetMetric,
  });
}

function exportReportCommand(input: ReportExportInputDTO): Result<ReportExportResultDTO, AppError> {
  const db = backendState.connection?.db;
  if (!db) {
    return err(createDbNotReadyError());
  }

  const defaultExportDir = path.join(app.getPath('documents'), 'Mozetobedzieto', 'reports');

  return exportDashboardReport({
    db,
    channelId: input.channelId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    targetMetric: input.targetMetric,
    exportDir: input.exportDir ?? defaultExportDir,
    formats: input.formats,
  });
}

const ipcBackend: DesktopIpcBackend = {
  getAppStatus: () => readAppStatus(),
  getDataModeStatus: () => readDataModeStatus(),
  setDataMode: (input) => setDataMode(input),
  probeDataMode: (input) => probeDataMode(input),
  listProfiles: () => listProfilesCommand(),
  createProfile: (input) => createProfileCommand(input),
  setActiveProfile: (input) => setActiveProfileCommand(input),
  getProfileSettings: () => readProfileSettingsCommand(),
  updateProfileSettings: (input) => updateProfileSettingsCommand(input),
  getAuthStatus: () => readAuthStatusCommand(),
  connectAuth: (input) => connectAuthCommand(input),
  disconnectAuth: () => disconnectAuthCommand(),
  startSync: (input) => startSync(input),
  resumeSync: (input) => resumeSync(input),
  runMlBaseline: (input) => runMlBaselineCommand(input),
  getMlForecast: (input) => getMlForecastCommand(input),
  generateReport: (input) => generateReportCommand(input),
  exportReport: (input) => exportReportCommand(input),
  getKpis: (query) => readKpis(query),
  getTimeseries: (query) => readTimeseries(query),
  getChannelInfo: (query) => readChannelInfo(query),
};

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  if (IS_DEV) {
    void win.loadURL(DEV_SERVER_URL);
  } else {
    void win.loadFile(UI_ENTRY_PATH);
  }

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  return win;
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    registerIpcHandlers(ipcMain, ipcBackend);

    const profileManagerInit = ensureProfileManager();
    if (!profileManagerInit.ok) {
      logger.error('Nie udalo sie zainicjalizowac menedzera profili.', {
        error: profileManagerInit.error.toDTO(),
      });
    }

    const backendInit = initializeBackend();
    if (!backendInit.ok) {
      logger.error('Nie udalo sie zainicjalizowac backendu.', {
        error: backendInit.error.toDTO(),
      });
    }

    mainWindow = createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
    });
  });
}

app.on('before-quit', () => {
  closeBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
