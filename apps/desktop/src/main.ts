import { createChannelQueries, createDatabaseConnection, createMetricsQueries, runMigrations, type ChannelQueries, type DatabaseConnection, type MetricsQueries } from '@moze/core';
import { getLatestMlForecast, runMlBaseline } from '@moze/ml';
import { exportDashboardReport, generateDashboardReport } from '@moze/reports';
import { createCachedDataProvider, createDataModeManager, createFakeDataProvider, createRateLimitedDataProvider, createRealDataProvider, createRecordingDataProvider, createSyncOrchestrator, type DataModeManager, type SyncOrchestrator } from '@moze/sync';
import { AppError, IPC_EVENTS, createLogger, err, ok, type AppStatusDTO, type DataModeProbeInputDTO, type DataModeProbeResultDTO, type DataModeStatusDTO, type KpiQueryDTO, type KpiResultDTO, type MlForecastQueryInputDTO, type MlForecastResultDTO, type MlRunBaselineInputDTO, type MlRunBaselineResultDTO, type ReportExportInputDTO, type ReportExportResultDTO, type ReportGenerateInputDTO, type ReportGenerateResultDTO, type Result, type SetDataModeInputDTO, type SyncCommandResultDTO, type SyncResumeInputDTO, type SyncStartInputDTO, type TimeseriesQueryDTO, type TimeseriesResultDTO } from '@moze/shared';
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers, type DesktopIpcBackend } from './ipc-handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createLogger({ baseContext: { module: 'desktop-main' } });

const IS_DEV = process.env.NODE_ENV !== 'production';
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173';
const UI_ENTRY_PATH = path.join(__dirname, '../../ui/dist/index.html');
const REPO_ROOT_PATH = path.resolve(__dirname, '../../..');
const DB_FILENAME = 'mozetobedzieto.sqlite';
const DEFAULT_FAKE_FIXTURE_PATH = path.join(REPO_ROOT_PATH, 'fixtures', 'seed-data.json');
const DEFAULT_RECORDING_PATH = path.join(REPO_ROOT_PATH, 'fixtures', 'recordings', 'latest-provider-recording.json');

interface BackendState {
  connection: DatabaseConnection | null;
  metricsQueries: MetricsQueries | null;
  channelQueries: ChannelQueries | null;
  dataModeManager: DataModeManager | null;
  syncOrchestrator: SyncOrchestrator | null;
  dbPath: string | null;
}

const backendState: BackendState = {
  connection: null,
  metricsQueries: null,
  channelQueries: null,
  dataModeManager: null,
  syncOrchestrator: null,
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
    'Baza danych nie jest gotowa. Uruchom ponownie aplikację.',
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

function resolvePathFromEnv(value: string | undefined, fallbackPath: string): string {
  if (!value) {
    return fallbackPath;
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  return path.join(REPO_ROOT_PATH, value);
}

function initializeDataModes(): Result<DataModeManager, AppError> {
  const fakeFixturePath = resolvePathFromEnv(process.env.MOZE_FAKE_FIXTURE_PATH, DEFAULT_FAKE_FIXTURE_PATH);
  const realFixturePath = resolvePathFromEnv(process.env.MOZE_REAL_FIXTURE_PATH, fakeFixturePath);
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

  const realProviderResult = createRealDataProvider({
    fixturePath: realFixturePath,
    providerName: 'real-fixture-provider',
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
  });

  logger.info('Data modes gotowe.', {
    fakeFixturePath,
    realFixturePath,
    recordingOutputPath,
    mode: manager.getStatus().mode,
  });

  return ok(manager);
}

function initializeBackend(): Result<void, AppError> {
  if (backendState.connection) {
    return ok(undefined);
  }

  const dbPath = path.join(app.getPath('userData'), DB_FILENAME);
  const connectionResult = createDatabaseConnection({ filename: dbPath });
  if (!connectionResult.ok) {
    return connectionResult;
  }

  const migrationResult = runMigrations(connectionResult.value.db);
  if (!migrationResult.ok) {
    const closeResult = connectionResult.value.close();
    if (!closeResult.ok) {
      logger.warning('Nie udało się zamknąć połączenia DB po błędzie migracji.', {
        error: closeResult.error.toDTO(),
      });
    }
    return migrationResult;
  }

  backendState.connection = connectionResult.value;
  backendState.metricsQueries = createMetricsQueries(connectionResult.value.db);
  backendState.channelQueries = createChannelQueries(connectionResult.value.db);
  backendState.dbPath = dbPath;

  const dataModesResult = initializeDataModes();
  if (!dataModesResult.ok) {
    const closeResult = connectionResult.value.close();
    if (!closeResult.ok) {
      logger.warning('Nie udalo sie zamknac polaczenia DB po bledzie data mode init.', {
        error: closeResult.error.toDTO(),
      });
    }
    return err(dataModesResult.error);
  }

  backendState.dataModeManager = dataModesResult.value;
  backendState.syncOrchestrator = createSyncOrchestrator({
    db: connectionResult.value.db,
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

  logger.info('Backend gotowy.', {
    dbPath,
    migrationsApplied: migrationResult.value.applied.length,
    migrationsAlreadyApplied: migrationResult.value.alreadyApplied.length,
  });

  return ok(undefined);
}

function closeBackend(): void {
  if (!backendState.connection) {
    return;
  }

  const closeResult = backendState.connection.close();
  if (!closeResult.ok) {
    logger.error('Nie udało się zamknąć bazy danych.', { error: closeResult.error.toDTO() });
  }

  backendState.connection = null;
  backendState.metricsQueries = null;
  backendState.channelQueries = null;
  backendState.dataModeManager = null;
  backendState.syncOrchestrator = null;
}

function readAppStatus(): Result<AppStatusDTO, AppError> {
  const db = backendState.connection?.db;
  if (!db) {
    return ok({
      version: app.getVersion(),
      dbReady: false,
      profileId: null,
      syncRunning: false,
      lastSyncAt: null,
    });
  }

  try {
    const activeProfileRow = db
      .prepare<[], { id: string }>(
        `
          SELECT id
          FROM profiles
          WHERE is_active = 1
          ORDER BY updated_at DESC, id ASC
          LIMIT 1
        `,
      )
      .get();

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
      profileId: activeProfileRow?.id ?? null,
      syncRunning: Boolean(latestSyncRunRow && latestSyncRunRow.finishedAt === null),
      lastSyncAt,
    });
  } catch (cause) {
    return err(
      AppError.create(
        'APP_STATUS_READ_FAILED',
        'Nie udało się odczytać statusu aplikacji.',
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

async function startSync(input: SyncStartInputDTO): Promise<Result<SyncCommandResultDTO, AppError>> {
  if (!backendState.syncOrchestrator) {
    return err(createSyncNotReadyError());
  }
  return backendState.syncOrchestrator.startSync(input);
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

    const backendInit = initializeBackend();
    if (!backendInit.ok) {
      logger.error('Nie udało się zainicjalizować backendu.', {
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
