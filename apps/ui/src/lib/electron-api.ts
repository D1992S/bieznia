import type {
  DataModeProbeInputDTO,
  DataModeProbeResultDTO,
  DataModeStatusDTO,
  SetDataModeInputDTO,
  AppStatusDTO,
  ChannelIdDTO,
  ChannelInfoDTO,
  IpcResult,
  KpiQueryDTO,
  KpiResultDTO,
  MlForecastQueryInputDTO,
  MlForecastResultDTO,
  MlRunBaselineInputDTO,
  MlRunBaselineResultDTO,
  ReportExportInputDTO,
  ReportExportResultDTO,
  ReportGenerateInputDTO,
  ReportGenerateResultDTO,
  SyncCommandResultDTO,
  SyncResumeInputDTO,
  SyncStartInputDTO,
  TimeseriesQueryDTO,
  TimeseriesResultDTO,
} from '@moze/shared';
import type { ElectronAPI } from './electron-api.types.ts';

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

  const message = result.error.message;
  throw new Error(message);
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
