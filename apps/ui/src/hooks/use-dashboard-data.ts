import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  AssistantAskResultDTO,
  AssistantThreadListResultDTO,
  AssistantThreadMessagesResultDTO,
  CsvImportColumnMappingDTO,
  DataMode,
  MlAnomalySeverity,
  MlTargetMetric,
  ReportExportFormat,
  TimeseriesQueryDTO,
} from '@moze/shared';
import {
  connectAuth,
  askAssistant,
  createProfile,
  detectMlAnomalies,
  disconnectAuth,
  exportDashboardReport,
  fetchAppStatus,
  fetchAuthStatus,
  fetchAssistantThreadMessages,
  fetchAssistantThreads,
  fetchChannelInfo,
  fetchDashboardReport,
  fetchDataModeStatus,
  fetchMlAnomalies,
  fetchKpis,
  fetchMlForecast,
  fetchMlTrend,
  fetchProfileSettings,
  fetchProfiles,
  fetchTimeseries,
  previewCsvImport,
  probeDataMode,
  resumeSync,
  runCsvImport,
  runMlBaseline,
  searchContent,
  setActiveProfile,
  setDataMode,
  startSync,
  updateProfileSettings,
} from '../lib/electron-api.ts';

export const DEFAULT_CHANNEL_ID = 'UC-SEED-PL-001';
export type DateRangePreset = '7d' | '30d' | '90d' | 'custom';

export interface DateRange {
  dateFrom: string;
  dateTo: string;
}

export type CsvImportDelimiter = 'auto' | 'comma' | 'semicolon' | 'tab';

export interface CsvImportPreviewInput {
  channelId: string;
  sourceName?: string;
  csvText: string;
  delimiter?: CsvImportDelimiter;
  hasHeader?: boolean;
  previewRowsLimit?: number;
}

export interface CsvImportRunInput {
  channelId: string;
  sourceName?: string;
  csvText: string;
  delimiter?: CsvImportDelimiter;
  hasHeader?: boolean;
  mapping: CsvImportColumnMappingDTO;
}

export interface SearchContentInput {
  channelId: string;
  query: string;
  limit?: number;
  offset?: number;
}

export interface SearchContentItem {
  documentId: string;
  videoId: string | null;
  title: string;
  publishedAt: string | null;
  snippet: string;
  source: 'title' | 'description' | 'transcript';
  score: number;
}

export interface SearchContentResult {
  channelId: string;
  query: string;
  total: number;
  items: SearchContentItem[];
}

export interface AssistantAskInput {
  threadId?: string | null;
  channelId: string;
  question: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  targetMetric?: MlTargetMetric;
}

function invalidateProfileScopedQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['app'] });
  void queryClient.invalidateQueries({ queryKey: ['profiles'] });
  void queryClient.invalidateQueries({ queryKey: ['settings'] });
  void queryClient.invalidateQueries({ queryKey: ['auth'] });
  void queryClient.invalidateQueries({ queryKey: ['db'] });
  void queryClient.invalidateQueries({ queryKey: ['ml'] });
  void queryClient.invalidateQueries({ queryKey: ['reports'] });
  void queryClient.invalidateQueries({ queryKey: ['assistant'] });
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildDateRange(days: number, now: Date = new Date()): DateRange {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return {
    dateFrom: toIsoDate(start),
    dateTo: toIsoDate(end),
  };
}

export function isDateRangeValid(range: DateRange): boolean {
  return range.dateFrom.length > 0 && range.dateTo.length > 0 && range.dateFrom <= range.dateTo;
}

export function useAppStatusQuery() {
  return useQuery({
    queryKey: ['app', 'status'],
    queryFn: () => fetchAppStatus(),
    staleTime: 5_000,
  });
}

export function useDataModeStatusQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['app', 'data-mode'],
    queryFn: () => fetchDataModeStatus(),
    enabled,
    staleTime: 5_000,
  });
}

export function useSetDataModeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: DataMode) => setDataMode({ mode }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['app', 'data-mode'] });
    },
  });
}

export function useProbeDataModeMutation() {
  return useMutation({
    mutationFn: (input: { channelId: string; videoIds: string[]; recentLimit: number }) =>
      probeDataMode(input),
  });
}

export function useProfilesQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['profiles', 'list'],
    queryFn: () => fetchProfiles(),
    enabled,
    staleTime: 5_000,
  });
}

export function useCreateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; setActive?: boolean }) =>
      createProfile({
        name: input.name,
        setActive: input.setActive ?? true,
      }),
    onSuccess: () => {
      invalidateProfileScopedQueries(queryClient);
    },
  });
}

export function useSetActiveProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { profileId: string }) => setActiveProfile(input),
    onSuccess: () => {
      invalidateProfileScopedQueries(queryClient);
    },
  });
}

export function useProfileSettingsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['settings', 'profile'],
    queryFn: () => fetchProfileSettings(),
    enabled,
    staleTime: 5_000,
  });
}

export function useUpdateProfileSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settingsPatch: {
      defaultChannelId?: string;
      preferredForecastMetric?: MlTargetMetric;
      defaultDatePreset?: '7d' | '30d' | '90d';
      autoRunSync?: boolean;
      autoRunMl?: boolean;
      reportFormats?: ReportExportFormat[];
      language?: 'pl';
    }) =>
      updateProfileSettings({ settings: settingsPatch }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings', 'profile'] });
      void queryClient.invalidateQueries({ queryKey: ['app', 'status'] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      void queryClient.invalidateQueries({ queryKey: ['ml'] });
    },
  });
}

export function useAuthStatusQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['auth', 'status'],
    queryFn: () => fetchAuthStatus(),
    enabled,
    staleTime: 5_000,
  });
}

export function useConnectAuthMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      provider: 'youtube';
      accountLabel: string;
      accessToken: string;
      refreshToken?: string | null;
    }) => connectAuth(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auth', 'status'] });
      void queryClient.invalidateQueries({ queryKey: ['app', 'data-mode'] });
    },
  });
}

export function useDisconnectAuthMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => disconnectAuth(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auth', 'status'] });
      void queryClient.invalidateQueries({ queryKey: ['app', 'data-mode'] });
    },
  });
}

export function useCsvImportPreviewMutation() {
  return useMutation({
    mutationFn: (input: CsvImportPreviewInput) =>
      previewCsvImport({
        channelId: input.channelId,
        sourceName: input.sourceName ?? 'manual-csv',
        csvText: input.csvText,
        delimiter: input.delimiter ?? 'auto',
        hasHeader: input.hasHeader ?? true,
        previewRowsLimit: input.previewRowsLimit ?? 10,
      }),
  });
}

export function useCsvImportRunMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CsvImportRunInput) =>
      runCsvImport({
        channelId: input.channelId,
        sourceName: input.sourceName ?? 'manual-csv',
        csvText: input.csvText,
        delimiter: input.delimiter ?? 'auto',
        hasHeader: input.hasHeader ?? true,
        mapping: input.mapping,
      }),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: ['db'] });
      void queryClient.invalidateQueries({ queryKey: ['ml', 'forecast', input.channelId] });
      void queryClient.invalidateQueries({ queryKey: ['ml', 'anomalies', input.channelId] });
      void queryClient.invalidateQueries({ queryKey: ['ml', 'trend', input.channelId] });
      void queryClient.invalidateQueries({ queryKey: ['reports', 'dashboard', input.channelId] });
      void queryClient.invalidateQueries({ queryKey: ['search', 'content', input.channelId] });
    },
  });
}

export function useSearchContentMutation() {
  return useMutation({
    mutationFn: async (input: SearchContentInput): Promise<SearchContentResult> => {
      const result = await searchContent({
        channelId: input.channelId,
        query: input.query,
        limit: input.limit ?? 20,
        offset: input.offset ?? 0,
      });
      return {
        channelId: result.channelId,
        query: result.query,
        total: result.total,
        items: result.items,
      };
    },
  });
}

export function useAssistantThreadsQuery(channelId: string, enabled: boolean) {
  return useQuery<AssistantThreadListResultDTO>({
    queryKey: ['assistant', 'threads', channelId],
    queryFn: () =>
      fetchAssistantThreads({
        channelId,
        limit: 20,
      }),
    enabled,
    staleTime: 10_000,
  });
}

export function useAssistantThreadMessagesQuery(threadId: string | null, enabled: boolean) {
  return useQuery<AssistantThreadMessagesResultDTO>({
    queryKey: ['assistant', 'thread', threadId],
    queryFn: () =>
      fetchAssistantThreadMessages({
        threadId: threadId ?? '',
      }),
    enabled: enabled && Boolean(threadId),
    staleTime: 5_000,
  });
}

export function useAskAssistantMutation() {
  const queryClient = useQueryClient();
  return useMutation<AssistantAskResultDTO, Error, AssistantAskInput>({
    mutationFn: (input) =>
      askAssistant({
        threadId: input.threadId ?? null,
        channelId: input.channelId,
        question: input.question,
        dateFrom: input.dateFrom ?? null,
        dateTo: input.dateTo ?? null,
        targetMetric: input.targetMetric ?? 'views',
      }),
    onSuccess: (result, input) => {
      void queryClient.invalidateQueries({ queryKey: ['assistant', 'threads', input.channelId] });
      void queryClient.invalidateQueries({ queryKey: ['assistant', 'thread', result.threadId] });
    },
  });
}

export function useStartSyncMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { channelId: string; profileId?: string | null; recentLimit: number }) =>
      startSync(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['app'] });
      void queryClient.invalidateQueries({ queryKey: ['db'] });
      void queryClient.invalidateQueries({ queryKey: ['ml', 'anomalies'] });
      void queryClient.invalidateQueries({ queryKey: ['ml', 'trend'] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

export function useResumeSyncMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { syncRunId: number; channelId: string; recentLimit: number }) =>
      resumeSync(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['app'] });
      void queryClient.invalidateQueries({ queryKey: ['db'] });
      void queryClient.invalidateQueries({ queryKey: ['ml', 'anomalies'] });
      void queryClient.invalidateQueries({ queryKey: ['ml', 'trend'] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

export function useMlForecastQuery(channelId: string, targetMetric: MlTargetMetric, enabled: boolean) {
  return useQuery({
    queryKey: ['ml', 'forecast', channelId, targetMetric],
    queryFn: () =>
      fetchMlForecast({
        channelId,
        targetMetric,
      }),
    enabled,
    staleTime: 15_000,
  });
}

export function useRunMlBaselineMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { channelId: string; targetMetric: MlTargetMetric; horizonDays: number }) =>
      runMlBaseline(input),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: ['ml', 'forecast', input.channelId, input.targetMetric] });
      void queryClient.invalidateQueries({ queryKey: ['ml', 'anomalies', input.channelId, input.targetMetric] });
      void queryClient.invalidateQueries({ queryKey: ['ml', 'trend', input.channelId, input.targetMetric] });
      void queryClient.invalidateQueries({ queryKey: ['db', 'timeseries', input.channelId] });
      void queryClient.invalidateQueries({ queryKey: ['reports', 'dashboard', input.channelId] });
    },
  });
}

export function useDetectMlAnomaliesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      channelId: string;
      targetMetric: MlTargetMetric;
      dateFrom: string;
      dateTo: string;
    }) =>
      detectMlAnomalies({
        channelId: input.channelId,
        targetMetric: input.targetMetric,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      }),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({
        queryKey: ['ml', 'anomalies', input.channelId, input.targetMetric, input.dateFrom, input.dateTo],
      });
      void queryClient.invalidateQueries({
        queryKey: ['ml', 'trend', input.channelId, input.targetMetric, input.dateFrom, input.dateTo],
      });
    },
  });
}

export function useMlAnomaliesQuery(
  channelId: string,
  targetMetric: MlTargetMetric,
  range: DateRange,
  severities: MlAnomalySeverity[],
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['ml', 'anomalies', channelId, targetMetric, range.dateFrom, range.dateTo, severities.join(',')],
    queryFn: () =>
      fetchMlAnomalies({
        channelId,
        targetMetric,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        severities: severities.length > 0 ? severities : undefined,
      }),
    enabled,
    staleTime: 30_000,
  });
}

export function useMlTrendQuery(
  channelId: string,
  targetMetric: MlTargetMetric,
  range: DateRange,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['ml', 'trend', channelId, targetMetric, range.dateFrom, range.dateTo],
    queryFn: () =>
      fetchMlTrend({
        channelId,
        targetMetric,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        seasonalityPeriodDays: 7,
      }),
    enabled,
    staleTime: 30_000,
  });
}

export function useChannelInfoQuery(channelId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['db', 'channel-info', channelId],
    queryFn: () => fetchChannelInfo({ channelId }),
    enabled,
    staleTime: 30_000,
  });
}

export function useKpisQuery(channelId: string, range: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: ['db', 'kpis', channelId, range.dateFrom, range.dateTo],
    queryFn: () =>
      fetchKpis({
        channelId,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      }),
    enabled,
    staleTime: 30_000,
  });
}

export function useTimeseriesQuery(
  channelId: string,
  range: DateRange,
  metric: TimeseriesQueryDTO['metric'],
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['db', 'timeseries', channelId, metric, range.dateFrom, range.dateTo],
    queryFn: () =>
      fetchTimeseries({
        channelId,
        metric,
        granularity: 'day',
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      }),
    enabled,
    staleTime: 30_000,
  });
}

export function useDashboardReportQuery(
  channelId: string,
  range: DateRange,
  targetMetric: MlTargetMetric,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['reports', 'dashboard', channelId, targetMetric, range.dateFrom, range.dateTo],
    queryFn: () =>
      fetchDashboardReport({
        channelId,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        targetMetric,
      }),
    enabled,
    staleTime: 30_000,
  });
}

export function useExportDashboardReportMutation() {
  return useMutation({
    mutationFn: (input: {
      channelId: string;
      dateFrom: string;
      dateTo: string;
      targetMetric: MlTargetMetric;
      exportDir?: string | null;
      formats: ReportExportFormat[];
    }) => exportDashboardReport(input),
  });
}
