import type {
  AppErrorDTO,
  DataModeProbeInputDTO,
  DataModeProbeResultDTO,
  DataModeStatusDTO,
  SetDataModeInputDTO,
  AuthConnectInputDTO,
  AuthStatusDTO,
  CsvImportPreviewInputDTO,
  CsvImportPreviewResultDTO,
  CsvImportRunInputDTO,
  CsvImportRunResultDTO,
  AppStatusDTO,
  ChannelIdDTO,
  ChannelInfoDTO,
  IpcResult,
  KpiQueryDTO,
  KpiResultDTO,
  MlAnomalyListResultDTO,
  MlAnomalyQueryInputDTO,
  MlDetectAnomaliesInputDTO,
  MlDetectAnomaliesResultDTO,
  MlForecastQueryInputDTO,
  MlForecastResultDTO,
  MlRunBaselineInputDTO,
  MlRunBaselineResultDTO,
  MlTrendQueryInputDTO,
  MlTrendResultDTO,
  ProfileListResultDTO,
  ProfileCreateInputDTO,
  ProfileSetActiveInputDTO,
  ProfileSettingsDTO,
  ReportExportInputDTO,
  ReportExportResultDTO,
  ReportGenerateInputDTO,
  ReportGenerateResultDTO,
  SearchContentInputDTO,
  SearchContentResultDTO,
  SettingsUpdateInputDTO,
  SyncCommandResultDTO,
  SyncResumeInputDTO,
  SyncStartInputDTO,
  TimeseriesQueryDTO,
  TimeseriesResultDTO,
} from '@moze/shared';
import type { ElectronAPI } from './electron-api.types.ts';

class IpcInvokeError extends Error {
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(error: AppErrorDTO) {
    super(`[${error.code}] ${error.message}`);
    this.name = 'IpcInvokeError';
    this.code = error.code;
    this.context = error.context ?? {};
  }
}

function ensureElectronApi(): ElectronAPI {
  if (!window.electronAPI) {
    throw new Error('Brak mostu Electron. Uruchom aplikacje przez desktop runtime.');
  }

  return window.electronAPI;
}

function unwrapResult<T>(result: IpcResult<T>): T {
  if (result.ok) {
    return result.value;
  }

  throw new IpcInvokeError(result.error);
}

export async function fetchAppStatus(): Promise<AppStatusDTO> {
  const api = ensureElectronApi();
  const result = await api.appGetStatus();
  return unwrapResult(result);
}

export async function fetchDataModeStatus(): Promise<DataModeStatusDTO> {
  const api = ensureElectronApi();
  const result = await api.appGetDataMode();
  return unwrapResult(result);
}

export async function setDataMode(input: SetDataModeInputDTO): Promise<DataModeStatusDTO> {
  const api = ensureElectronApi();
  const result = await api.appSetDataMode(input);
  return unwrapResult(result);
}

export async function probeDataMode(input: DataModeProbeInputDTO): Promise<DataModeProbeResultDTO> {
  const api = ensureElectronApi();
  const result = await api.appProbeDataMode(input);
  return unwrapResult(result);
}

export async function fetchProfiles(): Promise<ProfileListResultDTO> {
  const api = ensureElectronApi();
  const result = await api.profileList();
  return unwrapResult(result);
}

export async function createProfile(input: ProfileCreateInputDTO): Promise<ProfileListResultDTO> {
  const api = ensureElectronApi();
  const result = await api.profileCreate(input);
  return unwrapResult(result);
}

export async function setActiveProfile(input: ProfileSetActiveInputDTO): Promise<ProfileListResultDTO> {
  const api = ensureElectronApi();
  const result = await api.profileSetActive(input);
  return unwrapResult(result);
}

export async function fetchProfileSettings(): Promise<ProfileSettingsDTO> {
  const api = ensureElectronApi();
  const result = await api.settingsGet();
  return unwrapResult(result);
}

export async function updateProfileSettings(input: SettingsUpdateInputDTO): Promise<ProfileSettingsDTO> {
  const api = ensureElectronApi();
  const result = await api.settingsUpdate(input);
  return unwrapResult(result);
}

export async function fetchAuthStatus(): Promise<AuthStatusDTO> {
  const api = ensureElectronApi();
  const result = await api.authGetStatus();
  return unwrapResult(result);
}

export async function connectAuth(input: AuthConnectInputDTO): Promise<AuthStatusDTO> {
  const api = ensureElectronApi();
  const result = await api.authConnect(input);
  return unwrapResult(result);
}

export async function disconnectAuth(): Promise<AuthStatusDTO> {
  const api = ensureElectronApi();
  const result = await api.authDisconnect();
  return unwrapResult(result);
}

export async function previewCsvImport(input: CsvImportPreviewInputDTO): Promise<CsvImportPreviewResultDTO> {
  const api = ensureElectronApi();
  const result = await api.importCsvPreview(input);
  return unwrapResult(result);
}

export async function runCsvImport(input: CsvImportRunInputDTO): Promise<CsvImportRunResultDTO> {
  const api = ensureElectronApi();
  const result = await api.importCsvRun(input);
  return unwrapResult(result);
}

export async function searchContent(input: SearchContentInputDTO): Promise<SearchContentResultDTO> {
  const api = ensureElectronApi();
  const result = await api.searchContent(input);
  return unwrapResult(result);
}

export async function startSync(input: SyncStartInputDTO): Promise<SyncCommandResultDTO> {
  const api = ensureElectronApi();
  const result = await api.syncStart(input);
  return unwrapResult(result);
}

export async function resumeSync(input: SyncResumeInputDTO): Promise<SyncCommandResultDTO> {
  const api = ensureElectronApi();
  const result = await api.syncResume(input);
  return unwrapResult(result);
}

export async function runMlBaseline(input: MlRunBaselineInputDTO): Promise<MlRunBaselineResultDTO> {
  const api = ensureElectronApi();
  const result = await api.mlRunBaseline(input);
  return unwrapResult(result);
}

export async function fetchMlForecast(input: MlForecastQueryInputDTO): Promise<MlForecastResultDTO> {
  const api = ensureElectronApi();
  const result = await api.mlGetForecast(input);
  return unwrapResult(result);
}

export async function detectMlAnomalies(input: MlDetectAnomaliesInputDTO): Promise<MlDetectAnomaliesResultDTO> {
  const api = ensureElectronApi();
  const result = await api.mlDetectAnomalies(input);
  return unwrapResult(result);
}

export async function fetchMlAnomalies(input: MlAnomalyQueryInputDTO): Promise<MlAnomalyListResultDTO> {
  const api = ensureElectronApi();
  const result = await api.mlGetAnomalies(input);
  return unwrapResult(result);
}

export async function fetchMlTrend(input: MlTrendQueryInputDTO): Promise<MlTrendResultDTO> {
  const api = ensureElectronApi();
  const result = await api.mlGetTrend(input);
  return unwrapResult(result);
}

export async function fetchDashboardReport(input: ReportGenerateInputDTO): Promise<ReportGenerateResultDTO> {
  const api = ensureElectronApi();
  const result = await api.reportsGenerate(input);
  return unwrapResult(result);
}

export async function exportDashboardReport(input: ReportExportInputDTO): Promise<ReportExportResultDTO> {
  const api = ensureElectronApi();
  const result = await api.reportsExport(input);
  return unwrapResult(result);
}

export async function fetchKpis(query: KpiQueryDTO): Promise<KpiResultDTO> {
  const api = ensureElectronApi();
  const result = await api.dbGetKpis(query);
  return unwrapResult(result);
}

export async function fetchTimeseries(query: TimeseriesQueryDTO): Promise<TimeseriesResultDTO> {
  const api = ensureElectronApi();
  const result = await api.dbGetTimeseries(query);
  return unwrapResult(result);
}

export async function fetchChannelInfo(query: ChannelIdDTO): Promise<ChannelInfoDTO> {
  const api = ensureElectronApi();
  const result = await api.dbGetChannelInfo(query);
  return unwrapResult(result);
}
