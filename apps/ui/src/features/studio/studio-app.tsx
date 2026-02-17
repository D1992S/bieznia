import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CsvImportColumnMappingDTO,
  DataMode,
  DiagnosticsRecoveryAction,
  MlAnomalySeverity,
  MlForecastPointDTO,
  MlTargetMetric,
  ReportExportFormat,
  SyncCompleteEvent,
  SyncErrorEvent,
  SyncProgressEvent,
  TimeseriesPoint,
} from '@moze/shared';
import {
  DEFAULT_CHANNEL_ID,
  DEFAULT_DIAGNOSTICS_RECOVERY_ACTIONS,
  DEFAULT_TOPIC_CLUSTER_LIMIT,
  DEFAULT_TOPIC_GAP_LIMIT,
  buildDateRange,
  isDateRangeValid,
  useAppStatusQuery,
  useAskAssistantMutation,
  useAssistantThreadMessagesQuery,
  useAssistantThreadsQuery,
  useAuthStatusQuery,
  useChannelInfoQuery,
  useConnectAuthMutation,
  useCompetitorInsightsQuery,
  useCsvImportPreviewMutation,
  useCsvImportRunMutation,
  useDetectMlAnomaliesMutation,
  useDiagnosticsHealthQuery,
  useCreateProfileMutation,
  useDashboardReportQuery,
  useDataModeStatusQuery,
  useDisconnectAuthMutation,
  useExportDashboardReportMutation,
  useKpisQuery,
  useMlAnomaliesQuery,
  useMlForecastQuery,
  useMlTrendQuery,
  useQualityScoresQuery,
  useProbeDataModeMutation,
  usePlanningPlanQuery,
  useProfileSettingsQuery,
  useProfilesQuery,
  useResumeSyncMutation,
  useRunMlBaselineMutation,
  useRunDiagnosticsRecoveryMutation,
  useRunTopicIntelligenceMutation,
  useSearchContentMutation,
  useSetActiveProfileMutation,
  useSetDataModeMutation,
  useGeneratePlanningPlanMutation,
  useSyncCompetitorsMutation,
  useTopicIntelligenceQuery,
  useStartSyncMutation,
  useTimeseriesQuery,
  useUpdateProfileSettingsMutation,
  type CsvImportDelimiter,
  type DateRange,
  type DateRangePreset,
} from '../../hooks/use-dashboard-data.ts';
import { useAppStore } from '../../store/index.ts';

interface ChartPoint {
  date: string;
  actual: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
}

interface KpiCardData {
  label: string;
  value: number;
  delta: number;
  tone: 'primary' | 'accent' | 'neutral';
}

type AppTab = 'stats' | 'reports' | 'settings' | 'import' | 'assistant';
type TrendDirection = 'up' | 'down' | 'flat';
type ChangePointDirection = 'up' | 'down';
type AnomalyMethod = 'zscore' | 'iqr' | 'consensus';
type WeeklyPackageStage = 'idle' | 'sync' | 'anomaly' | 'competitors' | 'topics' | 'planning' | 'report' | 'done' | 'failed';

interface WeeklyPackageState {
  stage: WeeklyPackageStage;
  message: string;
  error: string | null;
  finishedAt: string | null;
}

const ALL_DATA_MODES: DataMode[] = ['fake', 'real', 'record'];
const ML_ANOMALY_SEVERITY_VALUES: ReadonlyArray<MlAnomalySeverity> = ['low', 'medium', 'high', 'critical'];
const ONBOARDING_STORAGE_KEY = 'moze.ui.onboarding.v1.completed';
const STUDIO_THEME = {
  bg: '#0c0d10',
  panel: '#191b20',
  panelElevated: '#1f232b',
  border: '#2a2f37',
  text: '#f8fafc',
  title: '#b4bac3',
  muted: '#8c949f',
  accent: '#96c5ff',
  forecast: '#cfadff',
  success: '#1dbf73',
  warning: '#ffbf75',
  danger: '#ff7d9f',
};

const STUDIO_CSS = `
.studio-app button {
  border-radius: 8px;
  border: 1px solid #3a4452;
  background: #222830;
  color: #f8fafc;
  padding: 0.45rem 0.7rem;
  cursor: pointer;
}

.studio-app button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.studio-app input,
.studio-app select,
.studio-app textarea {
  border: 1px solid #3a4452;
  background: #11151b;
  color: #f8fafc;
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
}

.studio-app section,
.studio-app details {
  background: #191b20 !important;
  border: 1px solid #2a2f37 !important;
  border-radius: 16px !important;
}

.studio-app table {
  color: #f8fafc;
}

.studio-app th,
.studio-app td {
  border-color: #2a2f37 !important;
}

.studio-app .shortcut-hint {
  color: #8c949f;
  font-size: 12px;
  margin-top: 6px;
}

@media (max-width: 1100px) {
  .studio-app .assistant-layout {
    grid-template-columns: 1fr !important;
  }

  .studio-app .assistant-messages {
    max-height: 320px !important;
  }
}
`;

const StudioForecastChart = lazy(async () => {
  const module = await import('../../components/studio-forecast-chart.tsx');
  return { default: module.StudioForecastChart };
});

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pl-PL').format(Math.round(value));
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace('.', ',')} mln`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace('.', ',')} tys.`;
  }
  return formatNumber(value);
}

export function formatDateTick(dateIso: string): string {
  const parsed = new Date(`${dateIso}T00:00:00`);
  return parsed.toLocaleDateString('pl-PL', { day: '2-digit', month: 'short' });
}

function readMutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

function dataModeLabel(mode: DataMode): string {
  switch (mode) {
    case 'fake':
      return 'fake';
    case 'real':
      return 'real';
    case 'record':
      return 'record';
  }
}

function isMlAnomalySeverity(value: string): value is MlAnomalySeverity {
  return ML_ANOMALY_SEVERITY_VALUES.some((severity) => severity === value);
}

export function getTrendDirectionLabel(direction: TrendDirection): string {
  switch (direction) {
    case 'up':
      return 'wzrost';
    case 'down':
      return 'spadek';
    case 'flat':
      return 'brak zmiany';
  }
}

export function getChangePointDirectionLabel(direction: ChangePointDirection): string {
  return direction === 'up' ? 'wzrost' : 'spadek';
}

export function getAnomalySeverityLabel(severity: MlAnomalySeverity): string {
  switch (severity) {
    case 'critical':
      return 'krytyczna';
    case 'high':
      return 'wysoka';
    case 'medium':
      return 'średnia';
    case 'low':
      return 'niska';
  }
}

export function getAnomalyMethodLabel(method: AnomalyMethod): string {
  switch (method) {
    case 'consensus':
      return 'konsensus metod';
    case 'zscore':
      return 'metoda z-score';
    case 'iqr':
      return 'metoda IQR';
  }
}

export function getQualityConfidenceLabel(confidence: 'low' | 'medium' | 'high'): string {
  switch (confidence) {
    case 'high':
      return 'wysoka';
    case 'medium':
      return 'średnia';
    case 'low':
      return 'niska';
  }
}

export function getTopicTrendDirectionLabel(direction: 'rising' | 'stable' | 'declining'): string {
  switch (direction) {
    case 'rising':
      return 'rosnący';
    case 'declining':
      return 'spadkowy';
    case 'stable':
      return 'stabilny';
  }
}

export function getTopicConfidenceLabel(confidence: 'low' | 'medium' | 'high'): string {
  switch (confidence) {
    case 'high':
      return 'wysoka';
    case 'medium':
      return 'średnia';
    case 'low':
      return 'niska';
  }
}

export function getPlanningConfidenceLabel(confidence: 'low' | 'medium' | 'high'): string {
  switch (confidence) {
    case 'high':
      return 'wysoka';
    case 'medium':
      return 'średnia';
    case 'low':
      return 'niska';
  }
}

export function getDiagnosticsHealthStatusLabel(status: 'ok' | 'warning' | 'error'): string {
  switch (status) {
    case 'ok':
      return 'OK';
    case 'warning':
      return 'ostrzeżenie';
    case 'error':
      return 'błąd';
  }
}

export function getDiagnosticsRecoveryStatusLabel(status: 'ok' | 'partial' | 'failed'): string {
  switch (status) {
    case 'ok':
      return 'zakończono pomyślnie';
    case 'partial':
      return 'częściowo wykonano';
    case 'failed':
      return 'zakończono błędem';
  }
}

export function getDiagnosticsStepStatusLabel(status: 'ok' | 'skipped' | 'failed'): string {
  switch (status) {
    case 'ok':
      return 'wykonano';
    case 'skipped':
      return 'pominięto';
    case 'failed':
      return 'błąd';
  }
}

export function getDiagnosticsActionLabel(action: DiagnosticsRecoveryAction): string {
  switch (action) {
    case 'invalidate_analytics_cache':
      return 'Inwalidacja cache analityki';
    case 'rerun_data_pipeline':
      return 'Ponowne przeliczenie pipeline';
    case 'vacuum_database':
      return 'VACUUM bazy danych';
    case 'reindex_fts':
      return 'REINDEX FTS';
    case 'integrity_check':
      return 'Kontrola integralności';
  }
}

function getDiagnosticsStatusColor(status: 'ok' | 'warning' | 'error' | 'skipped' | 'failed'): string {
  switch (status) {
    case 'ok':
      return STUDIO_THEME.success;
    case 'warning':
      return STUDIO_THEME.warning;
    case 'skipped':
      return STUDIO_THEME.muted;
    case 'error':
    case 'failed':
      return STUDIO_THEME.danger;
  }
}

export function getWeeklyStageLabel(stage: WeeklyPackageStage): string {
  switch (stage) {
    case 'idle':
      return 'Gotowe do uruchomienia';
    case 'sync':
      return 'Synchronizacja danych';
    case 'anomaly':
      return 'Analiza anomalii i trendów';
    case 'competitors':
      return 'Synchronizacja konkurencji';
    case 'topics':
      return 'Analiza tematów';
    case 'planning':
      return 'Generowanie planu publikacji';
    case 'report':
      return 'Odświeżanie i eksport raportu';
    case 'done':
      return 'Przebieg ukończony';
    case 'failed':
      return 'Przebieg przerwany błędem';
  }
}

export function mergeSeriesWithForecast(
  actualPoints: TimeseriesPoint[] | undefined,
  forecastPoints: MlForecastPointDTO[] | undefined,
): ChartPoint[] {
  const map = new Map<string, ChartPoint>();

  for (const point of actualPoints ?? []) {
    map.set(point.date, {
      date: point.date,
      actual: point.value,
      p10: null,
      p50: null,
      p90: null,
    });
  }

  for (const point of forecastPoints ?? []) {
    const existing = map.get(point.date);
    if (existing) {
      map.set(point.date, {
        ...existing,
        p10: point.p10,
        p50: point.p50,
        p90: point.p90,
      });
      continue;
    }

    map.set(point.date, {
      date: point.date,
      actual: null,
      p10: point.p10,
      p50: point.p50,
      p90: point.p90,
    });
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

type ImportMappingField = keyof CsvImportColumnMappingDTO;

const IMPORT_MAPPING_FIELDS: ReadonlyArray<{ field: ImportMappingField; label: string; required: boolean }> = [
  { field: 'date', label: 'Data', required: true },
  { field: 'views', label: 'Wyświetlenia', required: true },
  { field: 'subscribers', label: 'Subskrybenci', required: true },
  { field: 'videos', label: 'Liczba filmów', required: true },
  { field: 'likes', label: 'Polubienia', required: false },
  { field: 'comments', label: 'Komentarze', required: false },
  { field: 'title', label: 'Tytuł', required: false },
  { field: 'description', label: 'Opis', required: false },
  { field: 'transcript', label: 'Transkrypcja', required: false },
  { field: 'videoId', label: 'ID filmu', required: false },
  { field: 'publishedAt', label: 'Data publikacji', required: false },
];

export function App() {
  const setInitialized = useAppStore((state) => state.setInitialized);
  const isDesktopRuntime = typeof window !== 'undefined' && Boolean(window.electronAPI);
  const [activeTab, setActiveTab] = useState<AppTab>('stats');
  const [lastProgressEvent, setLastProgressEvent] = useState<SyncProgressEvent | null>(null);
  const [lastCompleteEvent, setLastCompleteEvent] = useState<SyncCompleteEvent | null>(null);
  const [lastErrorEvent, setLastErrorEvent] = useState<SyncErrorEvent | null>(null);
  const [resumeSyncRunId, setResumeSyncRunId] = useState<number | null>(null);
  const [datePreset, setDatePreset] = useState<DateRangePreset>('30d');
  const [customRange, setCustomRange] = useState<DateRange>(() => buildDateRange(30));
  const [newProfileName, setNewProfileName] = useState('');
  const [settingsChannelIdDraft, setSettingsChannelIdDraft] = useState(DEFAULT_CHANNEL_ID);
  const [authAccountLabel, setAuthAccountLabel] = useState('');
  const [authAccessToken, setAuthAccessToken] = useState('');
  const [authRefreshToken, setAuthRefreshToken] = useState('');
  const [csvSourceName, setCsvSourceName] = useState('manual-csv');
  const [csvDelimiter, setCsvDelimiter] = useState<CsvImportDelimiter>('auto');
  const [csvHasHeader, setCsvHasHeader] = useState(true);
  const [csvText, setCsvText] = useState('date,views,subscribers,videos,likes,comments,title,description\n2026-02-01,1200,10000,150,120,15,Nowy film,Opis filmu');
  const [csvMapping, setCsvMapping] = useState<Partial<CsvImportColumnMappingDTO>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [anomalySeverityFilter, setAnomalySeverityFilter] = useState<'all' | MlAnomalySeverity>('all');
  const [lastAutoAnomalyRunKey, setLastAutoAnomalyRunKey] = useState<string | null>(null);
  const [assistantQuestion, setAssistantQuestion] = useState('Jak szły moje filmy w ostatnim miesiącu?');
  const [activeAssistantThreadId, setActiveAssistantThreadId] = useState<string | null>(null);
  const [isCreatingNewThread, setIsCreatingNewThread] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [weeklyPackageState, setWeeklyPackageState] = useState<WeeklyPackageState>({
    stage: 'idle',
    message: 'Uruchom przebieg tygodniowy jednym kliknięciem.',
    error: null,
    finishedAt: null,
  });

  const statusQuery = useAppStatusQuery();
  const dataModeQuery = useDataModeStatusQuery(isDesktopRuntime);
  const profilesQuery = useProfilesQuery(isDesktopRuntime);
  const createProfileMutation = useCreateProfileMutation();
  const setActiveProfileMutation = useSetActiveProfileMutation();
  const settingsQuery = useProfileSettingsQuery(isDesktopRuntime && statusQuery.data?.dbReady === true);
  const updateSettingsMutation = useUpdateProfileSettingsMutation();
  const authStatusQuery = useAuthStatusQuery(isDesktopRuntime);
  const connectAuthMutation = useConnectAuthMutation();
  const disconnectAuthMutation = useDisconnectAuthMutation();
  const setModeMutation = useSetDataModeMutation();
  const probeModeMutation = useProbeDataModeMutation();
  const startSyncMutation = useStartSyncMutation();
  const resumeSyncMutation = useResumeSyncMutation();
  const runMlMutation = useRunMlBaselineMutation();
  const detectMlAnomaliesMutation = useDetectMlAnomaliesMutation();
  const exportReportMutation = useExportDashboardReportMutation();
  const csvPreviewMutation = useCsvImportPreviewMutation();
  const csvImportMutation = useCsvImportRunMutation();
  const searchContentMutation = useSearchContentMutation();
  const askAssistantMutation = useAskAssistantMutation();
  const syncCompetitorsMutation = useSyncCompetitorsMutation();
  const runTopicIntelligenceMutation = useRunTopicIntelligenceMutation();
  const generatePlanningPlanMutation = useGeneratePlanningPlanMutation();
  const runDiagnosticsRecoveryMutation = useRunDiagnosticsRecoveryMutation();

  useEffect(() => {
    const defaultDatePreset = settingsQuery.data?.defaultDatePreset;
    if (!defaultDatePreset) {
      return;
    }
    setDatePreset((currentPreset) => (currentPreset === 'custom' ? currentPreset : defaultDatePreset));
  }, [settingsQuery.data?.defaultDatePreset]);

  useEffect(() => {
    const defaultChannelId = settingsQuery.data?.defaultChannelId;
    if (!defaultChannelId) {
      return;
    }
    setSettingsChannelIdDraft(defaultChannelId);
  }, [settingsQuery.data?.defaultChannelId]);

  useEffect(() => {
    if (!csvPreviewMutation.data) {
      return;
    }

    setCsvMapping((current) => ({
      ...csvPreviewMutation.data.suggestedMapping,
      ...current,
    }));
  }, [csvPreviewMutation.data]);

  const dateRange = useMemo<DateRange>(() => {
    if (datePreset === 'custom') {
      return customRange;
    }
    if (datePreset === '7d') {
      return buildDateRange(7);
    }
    if (datePreset === '90d') {
      return buildDateRange(90);
    }
    return buildDateRange(30);
  }, [customRange, datePreset]);

  const channelId = settingsQuery.data?.defaultChannelId ?? DEFAULT_CHANNEL_ID;
  const topicClusterLimit = DEFAULT_TOPIC_CLUSTER_LIMIT;
  const topicGapLimit = DEFAULT_TOPIC_GAP_LIMIT;
  const mlTargetMetric: MlTargetMetric = settingsQuery.data?.preferredForecastMetric ?? 'views';
  const exportFormats: ReportExportFormat[] = settingsQuery.data?.reportFormats ?? ['json', 'csv', 'html'];
  const timeseriesMetric: 'views' | 'subscribers' = mlTargetMetric === 'subscribers' ? 'subscribers' : 'views';
  const validRange = isDateRangeValid(dateRange);
  const dataReady = isDesktopRuntime && statusQuery.data?.dbReady === true;

  const dataEnabled = dataReady && validRange;
  const channelInfoQuery = useChannelInfoQuery(channelId, dataEnabled);
  const kpisQuery = useKpisQuery(channelId, dateRange, dataEnabled);
  const timeseriesQuery = useTimeseriesQuery(channelId, dateRange, timeseriesMetric, dataEnabled);
  const mlForecastQuery = useMlForecastQuery(channelId, mlTargetMetric, dataEnabled);
  const selectedAnomalySeverities = anomalySeverityFilter === 'all' ? [] : [anomalySeverityFilter];
  const mlAnomaliesQuery = useMlAnomaliesQuery(
    channelId,
    mlTargetMetric,
    dateRange,
    selectedAnomalySeverities,
    dataEnabled,
  );
  const mlTrendQuery = useMlTrendQuery(channelId, mlTargetMetric, dateRange, dataEnabled);
  const qualityScoresQuery = useQualityScoresQuery(channelId, dateRange, dataEnabled);
  const competitorInsightsQuery = useCompetitorInsightsQuery(channelId, dateRange, dataEnabled);
  const topicIntelligenceQuery = useTopicIntelligenceQuery(channelId, dateRange, dataEnabled, {
    clusterLimit: topicClusterLimit,
    gapLimit: topicGapLimit,
  });
  const planningPlanQuery = usePlanningPlanQuery(channelId, dateRange, dataEnabled);
  const diagnosticsHealthQuery = useDiagnosticsHealthQuery(channelId, dateRange, dataEnabled);
  const reportQuery = useDashboardReportQuery(channelId, dateRange, mlTargetMetric, dataEnabled);
  const assistantThreadsQuery = useAssistantThreadsQuery(channelId, dataEnabled);
  const assistantThreadMessagesQuery = useAssistantThreadMessagesQuery(activeAssistantThreadId, dataEnabled);
  const syncRunning = statusQuery.data?.syncRunning === true || startSyncMutation.isPending || resumeSyncMutation.isPending;
  const isWeeklyPackageRunning = weeklyPackageState.stage !== 'idle'
    && weeklyPackageState.stage !== 'done'
    && weeklyPackageState.stage !== 'failed';

  useEffect(() => {
    setInitialized(statusQuery.data?.dbReady === true);
  }, [setInitialized, statusQuery.data?.dbReady]);

  useEffect(() => {
    if (!isDesktopRuntime || !window.electronAPI) {
      return;
    }

    const unsubscribeProgress = window.electronAPI.onSyncProgress((event) => {
      setLastProgressEvent(event);
      setLastErrorEvent(null);
    });
    const unsubscribeComplete = window.electronAPI.onSyncComplete((event) => {
      setLastCompleteEvent(event);
      setLastErrorEvent(null);
      setResumeSyncRunId(null);
    });
    const unsubscribeError = window.electronAPI.onSyncError((event) => {
      setLastErrorEvent(event);
      const parsedRunId = Number(event.syncRunId);
      if (Number.isFinite(parsedRunId)) {
        setResumeSyncRunId(parsedRunId);
      }
    });

    return () => {
      unsubscribeProgress();
      unsubscribeComplete();
      unsubscribeError();
    };
  }, [isDesktopRuntime]);

  useEffect(() => {
    if (!dataEnabled || activeTab !== 'stats') {
      return;
    }

    const nextRunKey = `${channelId}:${mlTargetMetric}:${dateRange.dateFrom}:${dateRange.dateTo}`;
    if (lastAutoAnomalyRunKey === nextRunKey || detectMlAnomaliesMutation.isPending) {
      return;
    }

    setLastAutoAnomalyRunKey(nextRunKey);
    detectMlAnomaliesMutation.mutate({
      channelId,
      targetMetric: mlTargetMetric,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
    });
  }, [
    activeTab,
    channelId,
    dataEnabled,
    dateRange.dateFrom,
    dateRange.dateTo,
    detectMlAnomaliesMutation,
    lastAutoAnomalyRunKey,
    mlTargetMetric,
  ]);

  useEffect(() => {
    setActiveAssistantThreadId(null);
    setIsCreatingNewThread(false);
  }, [channelId]);

  useEffect(() => {
    if (!dataEnabled) {
      return;
    }

    const firstThreadId = assistantThreadsQuery.data?.items[0]?.threadId ?? null;
    if (isCreatingNewThread) {
      if (!firstThreadId) {
        setIsCreatingNewThread(false);
      }
      return;
    }

    if (!activeAssistantThreadId && firstThreadId) {
      setActiveAssistantThreadId(firstThreadId);
      setIsCreatingNewThread(false);
      return;
    }

    if (
      activeAssistantThreadId
      && assistantThreadsQuery.data
      && !assistantThreadsQuery.data.items.some((item) => item.threadId === activeAssistantThreadId)
    ) {
      setActiveAssistantThreadId(firstThreadId);
    }
  }, [activeAssistantThreadId, assistantThreadsQuery.data, dataEnabled, isCreatingNewThread]);

  const startSyncRun = useCallback(() => {
    if (!dataReady || syncRunning) {
      return;
    }
    startSyncMutation.mutate({
      channelId,
      profileId: statusQuery.data?.profileId ?? null,
      recentLimit: 10,
    });
  }, [channelId, dataReady, startSyncMutation, statusQuery.data?.profileId, syncRunning]);

  const submitAssistantQuestion = useCallback(() => {
    const nextQuestion = assistantQuestion.trim();
    if (nextQuestion.length < 3 || askAssistantMutation.isPending) {
      return;
    }

    askAssistantMutation.mutate(
      {
        threadId: activeAssistantThreadId,
        channelId,
        question: nextQuestion,
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
        targetMetric: mlTargetMetric,
      },
      {
        onSuccess: (response) => {
          setActiveAssistantThreadId(response.threadId);
          setIsCreatingNewThread(false);
          setAssistantQuestion('');
        },
      },
    );
  }, [
    activeAssistantThreadId,
    askAssistantMutation,
    assistantQuestion,
    channelId,
    dateRange.dateFrom,
    dateRange.dateTo,
    mlTargetMetric,
  ]);

  const runWeeklyPackage = useCallback(async () => {
    if (!dataEnabled || syncRunning || isWeeklyPackageRunning) {
      return;
    }

    const setStep = (stage: WeeklyPackageStage, message: string) => {
      setWeeklyPackageState({
        stage,
        message,
        error: null,
        finishedAt: null,
      });
    };

    try {
      setStep('sync', 'Uruchamianie synchronizacji danych...');
      await startSyncMutation.mutateAsync({
        channelId,
        profileId: statusQuery.data?.profileId ?? null,
        recentLimit: 14,
      });

      setStep('anomaly', 'Uruchamianie analizy anomalii i trendów...');
      await detectMlAnomaliesMutation.mutateAsync({
        channelId,
        targetMetric: mlTargetMetric,
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
      });

      setStep('competitors', 'Synchronizacja danych konkurencji...');
      await syncCompetitorsMutation.mutateAsync({
        channelId,
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
        competitorCount: 3,
      });

      setStep('topics', 'Przeliczanie analizy tematów...');
      await runTopicIntelligenceMutation.mutateAsync({
        channelId,
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
        clusterLimit: topicClusterLimit,
        gapLimit: topicGapLimit,
      });

      setStep('planning', 'Generowanie planu publikacji...');
      await generatePlanningPlanMutation.mutateAsync({
        channelId,
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
        maxRecommendations: 7,
        clusterLimit: topicClusterLimit,
        gapLimit: topicGapLimit,
      });

      setStep('report', 'Odświeżanie i eksport raportu...');
      await reportQuery.refetch();
      await exportReportMutation.mutateAsync({
        channelId,
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
        targetMetric: mlTargetMetric,
        formats: exportFormats,
      });

      setWeeklyPackageState({
        stage: 'done',
        message: 'Przebieg tygodniowy zakończony. Raport został wyeksportowany.',
        error: null,
        finishedAt: new Date().toISOString(),
      });
    } catch (error) {
      setWeeklyPackageState({
        stage: 'failed',
        message: 'Przebieg tygodniowy został przerwany.',
        error: readMutationErrorMessage(error, 'Nie udało się ukończyć przebiegu tygodniowego.'),
        finishedAt: new Date().toISOString(),
      });
    }
  }, [
    channelId,
    dataEnabled,
    dateRange.dateFrom,
    dateRange.dateTo,
    detectMlAnomaliesMutation,
    exportFormats,
    exportReportMutation,
    generatePlanningPlanMutation,
    isWeeklyPackageRunning,
    mlTargetMetric,
    reportQuery,
    runTopicIntelligenceMutation,
    startSyncMutation,
    syncCompetitorsMutation,
    syncRunning,
    statusQuery.data?.profileId,
    topicClusterLimit,
    topicGapLimit,
  ]);

  useEffect(() => {
    if (!isDesktopRuntime) {
      return;
    }

    try {
      const wasOnboardingCompleted = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1';
      setShowOnboarding(!wasOnboardingCompleted);
    } catch {
      setShowOnboarding(true);
    }
  }, [isDesktopRuntime]);

  useEffect(() => {
    if (!isDesktopRuntime) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const pressedWithCtrl = event.ctrlKey || event.metaKey;
      const target = event.target;
      const isEditable = target instanceof HTMLElement
        && (
          target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.tagName === 'SELECT'
          || target.isContentEditable
        );

      if (pressedWithCtrl && !event.altKey && !event.shiftKey) {
        if (event.key === '1') {
          event.preventDefault();
          setActiveTab('stats');
          return;
        }
        if (event.key === '2') {
          event.preventDefault();
          setActiveTab('assistant');
          return;
        }
        if (event.key === '3') {
          event.preventDefault();
          setActiveTab('reports');
          return;
        }
        if (event.key === '4') {
          event.preventDefault();
          setActiveTab('import');
          return;
        }
        if (event.key === '5') {
          event.preventDefault();
          setActiveTab('settings');
          return;
        }
        if (event.key === 'Enter' && activeTab === 'assistant' && isEditable) {
          event.preventDefault();
          submitAssistantQuestion();
        }
      }

      if (event.altKey && !pressedWithCtrl && event.key.toLowerCase() === 's') {
        event.preventDefault();
        startSyncRun();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTab, isDesktopRuntime, startSyncRun, submitAssistantQuestion]);

  if (!isDesktopRuntime) {
    return (
      <main style={{ minHeight: '100vh', padding: '2rem', background: STUDIO_THEME.bg, color: STUDIO_THEME.text, fontFamily: '"Segoe UI", "Trebuchet MS", sans-serif' }}>
        <h1>Mozetobedzieto</h1>
        <p>Uruchomiono sam interfejs web. Dane z backendu IPC są niedostępne.</p>
      </main>
    );
  }

  if (statusQuery.isLoading) {
    return (
      <main style={{ minHeight: '100vh', padding: '2rem', background: STUDIO_THEME.bg, color: STUDIO_THEME.text, fontFamily: '"Segoe UI", "Trebuchet MS", sans-serif' }}>
        <h1>Mozetobedzieto</h1>
        <p>Odczyt statusu aplikacji...</p>
      </main>
    );
  }

  if (statusQuery.isError || !statusQuery.data) {
    return (
      <main style={{ minHeight: '100vh', padding: '2rem', background: STUDIO_THEME.bg, color: STUDIO_THEME.text, fontFamily: '"Segoe UI", "Trebuchet MS", sans-serif' }}>
        <h1>Mozetobedzieto</h1>
        <p>Nie udało się odczytać statusu aplikacji.</p>
      </main>
    );
  }

  const appStatus = statusQuery.data;
  const modeStatus = dataModeQuery.data;
  const kpis = kpisQuery.data;
  const timeseries = timeseriesQuery.data;
  const mlForecast = mlForecastQuery.data;
  const report = reportQuery.data;
  const chartPoints = mergeSeriesWithForecast(timeseries?.points, mlForecast?.points);
  const anomalyMarkers = (mlAnomaliesQuery.data?.items ?? []).map((item) => ({
    date: item.date,
    severity: item.severity,
    method: item.method,
  }));
  const trendChangePoints = (mlTrendQuery.data?.changePoints ?? []).map((changePoint) => ({
    date: changePoint.date,
    direction: changePoint.direction,
  }));

  const kpiCards: KpiCardData[] = kpis
    ? [
      { label: 'Wyświetlenia', value: kpis.views, delta: kpis.viewsDelta, tone: 'primary' },
      { label: 'Subskrypcje', value: kpis.subscribers, delta: kpis.subscribersDelta, tone: 'accent' },
      { label: 'Filmy', value: kpis.videos, delta: kpis.videosDelta, tone: 'neutral' },
      { label: 'Śr. wyświetleń / film', value: kpis.avgViewsPerVideo, delta: 0, tone: 'neutral' },
    ]
    : [];
  const availableModes = new Set(modeStatus?.availableModes ?? []);
  const profileSwitchBlocked = syncRunning;
  const createProfileErrorMessage = createProfileMutation.isError
    ? readMutationErrorMessage(createProfileMutation.error, 'Nie udało się utworzyć profilu.')
    : null;
  const setActiveProfileErrorMessage = setActiveProfileMutation.isError
    ? readMutationErrorMessage(setActiveProfileMutation.error, 'Nie udało się przełączyć aktywnego profilu.')
    : null;
  const setModeErrorMessage = setModeMutation.isError
    ? readMutationErrorMessage(setModeMutation.error, 'Nie udało się przełączyć trybu danych.')
    : null;
  const previewHeaders = csvPreviewMutation.data?.headers ?? [];
  const requiredImportFields: Array<keyof CsvImportColumnMappingDTO> = ['date', 'views', 'subscribers', 'videos'];
  const canRunCsvImport = requiredImportFields.every((field) => {
    const mappedHeader = csvMapping[field];
    return typeof mappedHeader === 'string' && mappedHeader.trim().length > 0;
  });
  const qualityScores = qualityScoresQuery.data;
  const competitorInsights = competitorInsightsQuery.data;
  const topicIntelligence = topicIntelligenceQuery.data;
  const planningPlan = planningPlanQuery.data;
  const diagnosticsHealth = diagnosticsHealthQuery.data;
  const diagnosticsRecoveryResult = runDiagnosticsRecoveryMutation.data;
  const isCompetitorSyncDisabled = syncCompetitorsMutation.isPending
    || !dataEnabled
    || channelId.trim().length === 0
    || !isDateRangeValid(dateRange);
  const isTopicIntelligenceRunDisabled = runTopicIntelligenceMutation.isPending
    || !dataEnabled
    || channelId.trim().length === 0
    || !isDateRangeValid(dateRange);
  const isPlanningGenerateDisabled = generatePlanningPlanMutation.isPending
    || !dataEnabled
    || channelId.trim().length === 0
    || !isDateRangeValid(dateRange);
  const isDiagnosticsRecoveryDisabled = runDiagnosticsRecoveryMutation.isPending
    || !dataEnabled
    || channelId.trim().length === 0
    || !isDateRangeValid(dateRange);
  const assistantThreads = assistantThreadsQuery.data?.items ?? [];
  const assistantMessages = assistantThreadMessagesQuery.data?.messages ?? [];

  return (
    <main
      className="studio-app"
      style={{
        minHeight: '100vh',
        padding: 'clamp(12px, 2.6vw, 2rem)',
        background: STUDIO_THEME.bg,
        fontFamily: '"Segoe UI", "Trebuchet MS", sans-serif',
        color: STUDIO_THEME.text,
        colorScheme: 'dark',
      }}
    >
      <style>{STUDIO_CSS}</style>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ marginBottom: 6, color: STUDIO_THEME.text }}>Mozetobedzieto - Panel</h1>
        <p style={{ marginTop: 0, color: STUDIO_THEME.title }}>
          Stan bazy: {appStatus.dbReady ? 'Gotowa' : 'Niegotowa'} | Profil: {appStatus.profileId ?? 'Brak'} | Synchronizacja: {syncRunning ? 'w trakcie' : 'bez aktywnego procesu'}
        </p>
        <p style={{ marginTop: 0, color: STUDIO_THEME.title }}>
          Ostatnia synchronizacja: {appStatus.lastSyncAt ?? 'Brak'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              setShowOnboarding(true);
            }}
          >
            Pokaż samouczek
          </button>
          <span className="shortcut-hint">
            Skróty: Ctrl+1..5 (zakładki), Ctrl+Enter (wyślij pytanie asystenta), Alt+S (synchronizacja).
          </span>
        </div>
      </header>

      {showOnboarding && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'grid',
            placeItems: 'center',
            padding: 14,
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: 'min(760px, 100%)',
              border: `1px solid ${STUDIO_THEME.border}`,
              borderRadius: 16,
              background: STUDIO_THEME.panelElevated,
              padding: 16,
            }}
          >
            <h2 style={{ marginTop: 0 }}>Szybki start</h2>
            <p style={{ marginTop: 0, color: STUDIO_THEME.title }}>
              Ten panel prowadzi przez codzienny przepływ: synchronizacja danych, analiza, plan publikacji i raport.
            </p>
            <ol style={{ marginTop: 0, marginBottom: 12, paddingLeft: 20 }}>
              <li>W zakładce Statystyki uruchom „Przebieg tygodniowy”.</li>
              <li>Sprawdź wykres, anomalie, jakość treści i konkurencję.</li>
              <li>W „Systemie planowania” zatwierdź rekomendacje publikacji.</li>
              <li>W zakładce „Raporty i eksport” pobierz gotowy raport.</li>
            </ol>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setShowOnboarding(false);
                  try {
                    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
                  } catch {
                    // Ignore localStorage failures in restricted environments.
                  }
                }}
              >
                Rozpocznij pracę
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOnboarding(false);
                }}
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
        {([
          { id: 'stats', label: 'Statystyki' },
          { id: 'assistant', label: 'Asystent AI' },
          { id: 'reports', label: 'Raporty i eksport' },
          { id: 'import', label: 'Import i wyszukiwanie' },
          { id: 'settings', label: 'Ustawienia' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
            }}
            style={{
              borderRadius: 10,
              border: `1px solid ${activeTab === tab.id ? STUDIO_THEME.accent : STUDIO_THEME.border}`,
              background: activeTab === tab.id ? 'linear-gradient(145deg, #1e4f73 0%, #19395b 100%)' : STUDIO_THEME.panel,
              color: activeTab === tab.id ? '#f0f8ff' : STUDIO_THEME.title,
              padding: '0.58rem 0.9rem',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'stats' && (
      <section style={{ marginBottom: '1.5rem', padding: '1rem', border: `1px solid ${STUDIO_THEME.border}`, borderRadius: 16, background: STUDIO_THEME.panel }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Tryb codziennej pracy (Faza 19)</h2>
        <p style={{ marginTop: 0, marginBottom: 10, color: STUDIO_THEME.title }}>
          Jeden przycisk uruchamia pełny przebieg: synchronizacja → analiza → plan → raport.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              void runWeeklyPackage();
            }}
            disabled={isWeeklyPackageRunning || !dataEnabled || syncRunning}
          >
            {isWeeklyPackageRunning ? 'Trwa przebieg tygodniowy...' : 'Uruchom przebieg tygodniowy'}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('reports');
            }}
          >
            Przejdź do raportów
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('assistant');
            }}
          >
            Otwórz asystenta
          </button>
        </div>
        <p style={{ marginBottom: 0, color: weeklyPackageState.stage === 'failed' ? STUDIO_THEME.danger : STUDIO_THEME.title }}>
          Status: <strong>{getWeeklyStageLabel(weeklyPackageState.stage)}</strong> | {weeklyPackageState.message}
          {weeklyPackageState.finishedAt ? ` | zakończono: ${new Date(weeklyPackageState.finishedAt).toLocaleString('pl-PL')}` : ''}
        </p>
        {weeklyPackageState.error && (
          <p style={{ marginBottom: 0, color: STUDIO_THEME.danger }}>
            {weeklyPackageState.error}
          </p>
        )}
      </section>
      )}

      {activeTab === 'settings' && (
      <section style={{ marginBottom: '1.5rem', padding: '1rem', border: `1px solid ${STUDIO_THEME.border}`, borderRadius: 16, background: STUDIO_THEME.panel }}>
        <h2 style={{ marginTop: 0 }}>Profile i konto YouTube</h2>
        {profilesQuery.isLoading && <p>Odczyt profili...</p>}
        {profilesQuery.isError && <p>Nie udało się odczytać listy profili.</p>}
        {profilesQuery.data && (
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            {profilesQuery.data.profiles.map((profile) => (
              <div
                key={profile.id}
                style={{
                  border: `1px solid ${profile.isActive ? STUDIO_THEME.accent : STUDIO_THEME.border}`,
                  borderRadius: 10,
                  padding: '0.6rem',
                  background: profile.isActive ? '#1f2f46' : STUDIO_THEME.panelElevated,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  <strong>{profile.name}</strong> {profile.isActive ? '(aktywny)' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveProfileMutation.mutate({ profileId: profile.id });
                  }}
                  disabled={profile.isActive || setActiveProfileMutation.isPending || profileSwitchBlocked}
                >
                  Ustaw jako aktywny
                </button>
              </div>
            ))}
          </div>
        )}
        {profileSwitchBlocked && (
          <p style={{ marginTop: 0, color: STUDIO_THEME.warning }}>
            Przełączanie aktywnego profilu jest chwilowo zablokowane podczas trwającego syncu.
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input
            type="text"
            value={newProfileName}
            onChange={(event) => {
              setNewProfileName(event.target.value);
            }}
            placeholder="Nazwa nowego profilu"
            style={{ minWidth: 250 }}
          />
          <button
            type="button"
            onClick={() => {
              const nextName = newProfileName.trim();
              if (!nextName) {
                return;
              }
              createProfileMutation.mutate(
                { name: nextName, setActive: true },
                {
                  onSuccess: () => {
                    setNewProfileName('');
                  },
                },
              );
            }}
            disabled={createProfileMutation.isPending || profileSwitchBlocked || newProfileName.trim().length === 0}
          >
            Dodaj profil i aktywuj
          </button>
        </div>

        {createProfileErrorMessage && <p>{createProfileErrorMessage}</p>}
        {setActiveProfileErrorMessage && <p>{setActiveProfileErrorMessage}</p>}

        <h3 style={{ marginBottom: 8 }}>Połączenie konta YouTube</h3>
        {authStatusQuery.isLoading && <p>Odczyt statusu konta...</p>}
        {authStatusQuery.isError && <p>Nie udało się odczytać statusu konta.</p>}
        {authStatusQuery.data?.connected ? (
          <div>
            <p style={{ marginTop: 0 }}>
              Połączono: <strong>{authStatusQuery.data.accountLabel ?? 'konto bez etykiety'}</strong>
            </p>
            <button
              type="button"
              onClick={() => {
                disconnectAuthMutation.mutate();
              }}
              disabled={disconnectAuthMutation.isPending}
            >
              Rozłącz konto
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
            <input
              type="text"
              value={authAccountLabel}
              onChange={(event) => {
                setAuthAccountLabel(event.target.value);
              }}
              placeholder="Etykieta konta (np. Mój kanał)"
            />
            <input
              type="password"
              value={authAccessToken}
              onChange={(event) => {
                setAuthAccessToken(event.target.value);
              }}
              placeholder="Token dostępu"
            />
            <input
              type="password"
              value={authRefreshToken}
              onChange={(event) => {
                setAuthRefreshToken(event.target.value);
              }}
              placeholder="Token odświeżania (opcjonalnie)"
            />
            <button
              type="button"
              onClick={() => {
                connectAuthMutation.mutate(
                  {
                    provider: 'youtube',
                    accountLabel: authAccountLabel.trim(),
                    accessToken: authAccessToken.trim(),
                    refreshToken: authRefreshToken.trim() || null,
                  },
                  {
                    onSuccess: () => {
                      setAuthAccessToken('');
                      setAuthRefreshToken('');
                    },
                  },
                );
              }}
              disabled={
                connectAuthMutation.isPending
                || authAccountLabel.trim().length === 0
                || authAccessToken.trim().length === 0
              }
            >
              Połącz konto
            </button>
          </div>
        )}

        {connectAuthMutation.isError && <p>Nie udało się podłączyć konta.</p>}
        {disconnectAuthMutation.isError && <p>Nie udało się rozłączyć konta.</p>}
      </section>
      )}

      {activeTab === 'settings' && (
      <section style={{ marginBottom: '1.5rem', padding: '1rem', border: `1px solid ${STUDIO_THEME.border}`, borderRadius: 16, background: STUDIO_THEME.panel }}>
        <h2 style={{ marginTop: 0 }}>Ustawienia profilu</h2>
        {settingsQuery.isLoading && <p>Odczyt ustawień profilu...</p>}
        {settingsQuery.isError && <p>Nie udało się odczytać ustawień profilu.</p>}
        {settingsQuery.data && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <input
                type="text"
                value={settingsChannelIdDraft}
                onChange={(event) => {
                  setSettingsChannelIdDraft(event.target.value);
                }}
                placeholder="Domyślny identyfikator kanału"
                style={{ minWidth: 280 }}
              />
              <button
                type="button"
                onClick={() => {
                  const nextChannelId = settingsChannelIdDraft.trim();
                  if (!nextChannelId) {
                    return;
                  }
                  updateSettingsMutation.mutate({ defaultChannelId: nextChannelId });
                }}
                disabled={updateSettingsMutation.isPending || settingsChannelIdDraft.trim().length === 0}
              >
                Zapisz domyślny kanał
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {(['7d', '30d', '90d'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    updateSettingsMutation.mutate({ defaultDatePreset: preset });
                  }}
                  disabled={updateSettingsMutation.isPending}
                  style={{
                    borderRadius: 8,
                    border: settingsQuery.data.defaultDatePreset === preset ? `2px solid ${STUDIO_THEME.accent}` : `1px solid ${STUDIO_THEME.border}`,
                    background: settingsQuery.data.defaultDatePreset === preset ? '#1f2f46' : STUDIO_THEME.panelElevated,
                  }}
                >
                  Domyślny zakres: {preset}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => {
                  updateSettingsMutation.mutate({ preferredForecastMetric: 'views' });
                }}
                disabled={updateSettingsMutation.isPending}
              >
                Metryka prognozy: wyświetlenia
              </button>
              <button
                type="button"
                onClick={() => {
                  updateSettingsMutation.mutate({ preferredForecastMetric: 'subscribers' });
                }}
                disabled={updateSettingsMutation.isPending}
              >
                Metryka prognozy: subskrypcje
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  updateSettingsMutation.mutate({ autoRunSync: !settingsQuery.data.autoRunSync });
                }}
                disabled={updateSettingsMutation.isPending}
              >
                Auto sync: {settingsQuery.data.autoRunSync ? 'włączony' : 'wyłączony'}
              </button>
              <button
                type="button"
                onClick={() => {
                  updateSettingsMutation.mutate({ autoRunMl: !settingsQuery.data.autoRunMl });
                }}
                disabled={updateSettingsMutation.isPending}
              >
                Auto ML: {settingsQuery.data.autoRunMl ? 'włączony' : 'wyłączony'}
              </button>
            </div>
          </>
        )}
        {updateSettingsMutation.isError && <p>Nie udało się zapisać ustawień profilu.</p>}
      </section>
      )}

      {activeTab === 'stats' && (
      <section style={{ marginBottom: '1.5rem', padding: '1rem', border: `1px solid ${STUDIO_THEME.border}`, borderRadius: 16, background: STUDIO_THEME.panel }}>
        <h2 style={{ marginTop: 0 }}>Zakres dat</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {(['7d', '30d', '90d', 'custom'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setDatePreset(preset);
              }}
              style={{
                borderRadius: 8,
                border: datePreset === preset ? `2px solid ${STUDIO_THEME.accent}` : `1px solid ${STUDIO_THEME.border}`,
                background: datePreset === preset ? '#1f2f46' : STUDIO_THEME.panelElevated,
                color: STUDIO_THEME.text,
                padding: '0.45rem 0.75rem',
                cursor: 'pointer',
              }}
            >
              {preset === 'custom' ? 'Własny' : preset}
            </button>
          ))}
        </div>
        {datePreset === 'custom' && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label>
              Od:
              <input
                type="date"
                value={customRange.dateFrom}
                onChange={(event) => {
                  setCustomRange((prev) => ({ ...prev, dateFrom: event.target.value }));
                }}
                style={{ marginLeft: 6 }}
              />
            </label>
            <label>
              Do:
              <input
                type="date"
                value={customRange.dateTo}
                onChange={(event) => {
                  setCustomRange((prev) => ({ ...prev, dateTo: event.target.value }));
                }}
                style={{ marginLeft: 6 }}
              />
            </label>
          </div>
        )}
        <p style={{ marginTop: 10, color: validRange ? STUDIO_THEME.success : STUDIO_THEME.danger }}>
          Aktywny zakres: {dateRange.dateFrom} - {dateRange.dateTo} {validRange ? '' : '(niepoprawny)'}
        </p>
      </section>
      )}

      {activeTab === 'stats' && (
      <section style={{ marginBottom: '1.5rem', padding: '1rem', border: `1px solid ${STUDIO_THEME.border}`, borderRadius: 16, background: STUDIO_THEME.panel }}>
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>Statystyki</h2>
        {kpisQuery.isLoading && <p style={{ color: STUDIO_THEME.muted }}>Liczenie KPI...</p>}
        {kpisQuery.isError && (
          <p style={{ color: STUDIO_THEME.danger }}>
            Nie udało się pobrać KPI dla wybranego zakresu.
            {' '}
            <button type="button" onClick={() => { void kpisQuery.refetch(); }}>
              Spróbuj ponownie
            </button>
          </p>
        )}
        {kpiCards.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
            {kpiCards.map((card) => (
              <article
                key={card.label}
                style={{
                  background: STUDIO_THEME.panelElevated,
                  border: `1px solid ${STUDIO_THEME.border}`,
                  borderRadius: 16,
                  padding: 14,
                }}
              >
                <p style={{ margin: 0, color: STUDIO_THEME.title, fontSize: 13 }}>{card.label}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, margin: '10px 0 8px' }}>
                  <p style={{ margin: 0, fontSize: 29, fontWeight: 700, color: STUDIO_THEME.text }}>
                    {formatCompactNumber(card.value)}
                  </p>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      border: `1px solid ${card.delta >= 0 ? STUDIO_THEME.success : STUDIO_THEME.danger}`,
                      background: card.delta >= 0 ? 'rgba(29, 191, 115, 0.18)' : 'rgba(255, 125, 159, 0.18)',
                      color: card.delta >= 0 ? STUDIO_THEME.success : STUDIO_THEME.danger,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    aria-label={card.delta >= 0 ? 'Wzrost' : 'Spadek'}
                  >
                    {card.delta >= 0 ? '↑' : '↓'}
                  </span>
                </div>
                <p style={{ margin: 0, color: STUDIO_THEME.muted, fontSize: 13 }}>
                  {card.delta === 0
                    ? 'Bez zmian względem typowego poziomu'
                    : `${card.delta > 0 ? 'O' : 'O'} ${formatCompactNumber(Math.abs(card.delta))} ${card.delta > 0 ? 'więcej' : 'mniej'} niż zwykle`}
                </p>
              </article>
            ))}
          </div>
        )}
        <div
          style={{
            border: `1px solid ${STUDIO_THEME.border}`,
            borderRadius: 16,
            background: STUDIO_THEME.panelElevated,
            padding: 14,
          }}
        >
          <h3 style={{ margin: 0, color: STUDIO_THEME.text }}>Szereg czasowy + prognoza ML</h3>
          <p style={{ marginTop: 6, marginBottom: 10, color: STUDIO_THEME.muted }}>
            Widok w stylu Studio dla metryki: {mlTargetMetric === 'views' ? 'wyświetlenia' : 'subskrypcje'}
          </p>
          {timeseriesQuery.isLoading || mlForecastQuery.isLoading ? <p style={{ color: STUDIO_THEME.muted }}>Ładowanie wykresu...</p> : null}
          {timeseriesQuery.isError ? <p style={{ color: STUDIO_THEME.danger }}>Nie udało się odczytać szeregu czasowego.</p> : null}
          {mlForecastQuery.isError ? <p style={{ color: STUDIO_THEME.danger }}>Nie udało się odczytać prognozy ML.</p> : null}
          {(timeseriesQuery.isError || mlForecastQuery.isError) && (
            <p style={{ marginTop: 0 }}>
              <button
                type="button"
                onClick={() => {
                  void timeseriesQuery.refetch();
                  void mlForecastQuery.refetch();
                }}
              >
                Ponów odczyt wykresu i prognozy
              </button>
            </p>
          )}
          {chartPoints.length > 0 && (
            <Suspense fallback={<p style={{ color: STUDIO_THEME.muted }}>Ładowanie modułu wykresu...</p>}>
              <StudioForecastChart
                points={chartPoints}
                metricLabel={mlTargetMetric === 'views' ? 'wyświetleń' : 'subskrypcji'}
                anomalies={anomalyMarkers}
                changePoints={trendChangePoints}
              />
            </Suspense>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button
              type="button"
              onClick={() => {
                if (!validRange || !dataReady) {
                  return;
                }
                detectMlAnomaliesMutation.mutate({
                  channelId,
                  targetMetric: mlTargetMetric,
                  dateFrom: dateRange.dateFrom,
                  dateTo: dateRange.dateTo,
                });
              }}
              disabled={detectMlAnomaliesMutation.isPending || !validRange || !dataReady}
            >
              Analizuj anomalie i trendy
            </button>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Filtr anomalii:
              <select
                value={anomalySeverityFilter}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  if (nextValue === 'all' || isMlAnomalySeverity(nextValue)) {
                    setAnomalySeverityFilter(nextValue);
                    return;
                  }
                  setAnomalySeverityFilter('all');
                }}
              >
                <option value="all">Wszystkie</option>
                <option value="critical">Krytyczne</option>
                <option value="high">Wysokie</option>
                <option value="medium">Średnie</option>
                <option value="low">Niskie</option>
              </select>
            </label>
          </div>
          {detectMlAnomaliesMutation.isError && (
            <p style={{ color: STUDIO_THEME.danger }}>
              Nie udało się uruchomić analizy anomalii.
            </p>
          )}
          {detectMlAnomaliesMutation.data && (
            <p style={{ color: STUDIO_THEME.title }}>
              Analiza: punkty={formatNumber(detectMlAnomaliesMutation.data.analyzedPoints)}, anomalie=
              {formatNumber(detectMlAnomaliesMutation.data.anomaliesDetected)}, zmiany trendu=
              {formatNumber(detectMlAnomaliesMutation.data.changePointsDetected)}.
            </p>
          )}
          {mlForecast && mlForecast.points.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ marginTop: 0, marginBottom: 8, color: STUDIO_THEME.title }}>Następne predykcje (p50)</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                {mlForecast.points.slice(0, 8).map((point) => (
                  <div
                    key={`pred-${point.date}`}
                    style={{
                      border: `1px solid ${STUDIO_THEME.border}`,
                      borderRadius: 12,
                      padding: '0.55rem',
                      background: STUDIO_THEME.panel,
                    }}
                  >
                    <p style={{ margin: 0, color: STUDIO_THEME.muted }}>{formatDateTick(point.date)}</p>
                    <p style={{ margin: '4px 0 0', fontWeight: 700, color: STUDIO_THEME.text }}>{formatNumber(point.p50)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, marginTop: 12 }}>
            <section
              style={{
                border: `1px solid ${STUDIO_THEME.border}`,
                borderRadius: 12,
                padding: 10,
                background: STUDIO_THEME.panel,
              }}
            >
              <h4 style={{ margin: '0 0 8px 0' }}>Analiza trendu (Faza 10)</h4>
              {mlTrendQuery.isLoading && <p style={{ color: STUDIO_THEME.muted }}>Liczenie trendu...</p>}
              {mlTrendQuery.isError && <p style={{ color: STUDIO_THEME.danger }}>Nie udało się odczytać trendu.</p>}
              {mlTrendQuery.data && (
                <>
                  <p style={{ marginTop: 0, color: STUDIO_THEME.title }}>
                    Kierunek: <strong>{getTrendDirectionLabel(mlTrendQuery.data.summary.trendDirection)}</strong> | Delta trendu: {formatNumber(mlTrendQuery.data.summary.trendDelta)}
                  </p>
                  <p style={{ marginTop: 0, color: STUDIO_THEME.title }}>
                    Wykryte punkty zmiany: {formatNumber(mlTrendQuery.data.changePoints.length)}
                  </p>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {mlTrendQuery.data.changePoints.slice(0, 6).map((changePoint) => (
                      <div
                        key={`cp-feed-${changePoint.date}`}
                        style={{
                          border: `1px solid ${STUDIO_THEME.border}`,
                          borderRadius: 8,
                          padding: '0.45rem',
                          background: STUDIO_THEME.panelElevated,
                        }}
                      >
                        <strong>{formatDateTick(changePoint.date)}</strong> | {getChangePointDirectionLabel(changePoint.direction)} | wynik {changePoint.score.toFixed(2)}
                      </div>
                    ))}
                    {mlTrendQuery.data.changePoints.length === 0 && (
                      <p style={{ margin: 0, color: STUDIO_THEME.muted }}>Brak zmian trendu w tym zakresie.</p>
                    )}
                  </div>
                </>
              )}
            </section>
            <section
              style={{
                border: `1px solid ${STUDIO_THEME.border}`,
                borderRadius: 12,
                padding: 10,
                background: STUDIO_THEME.panel,
              }}
            >
              <h4 style={{ margin: '0 0 8px 0' }}>Lista anomalii (Faza 10)</h4>
              {mlAnomaliesQuery.isLoading && <p style={{ color: STUDIO_THEME.muted }}>Ładowanie anomalii...</p>}
              {mlAnomaliesQuery.isError && <p style={{ color: STUDIO_THEME.danger }}>Nie udało się odczytać anomalii.</p>}
              {mlAnomaliesQuery.data && (
                <>
                  <p style={{ marginTop: 0, color: STUDIO_THEME.title }}>
                    Wykryte anomalie: {formatNumber(mlAnomaliesQuery.data.total)}
                  </p>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {mlAnomaliesQuery.data.items.slice(0, 8).map((anomaly) => (
                      <article
                        key={`anomaly-${anomaly.id}`}
                        style={{
                          border: `1px solid ${STUDIO_THEME.border}`,
                          borderRadius: 8,
                          padding: '0.45rem',
                          background: STUDIO_THEME.panelElevated,
                        }}
                      >
                        <p style={{ margin: 0 }}>
                          <strong>{formatDateTick(anomaly.date)}</strong> | istotność: {getAnomalySeverityLabel(anomaly.severity)} | metoda: {getAnomalyMethodLabel(anomaly.method)}
                        </p>
                        <p style={{ margin: '4px 0 0', color: STUDIO_THEME.muted }}>{anomaly.explanation}</p>
                      </article>
                    ))}
                    {mlAnomaliesQuery.data.items.length === 0 && (
                      <p style={{ margin: 0, color: STUDIO_THEME.muted }}>Brak anomalii dla wybranego zakresu.</p>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            border: `1px solid ${STUDIO_THEME.border}`,
            borderRadius: 16,
            background: STUDIO_THEME.panelElevated,
            padding: 14,
          }}
        >
          <h3 style={{ margin: 0, color: STUDIO_THEME.text }}>Ocena jakości treści (Faza 13)</h3>
          <p style={{ marginTop: 6, marginBottom: 10, color: STUDIO_THEME.muted }}>
            Ranking jakości treści na podstawie dynamiki, efektywności, zaangażowania, retencji i stabilności.
          </p>
          {qualityScoresQuery.isLoading && <p style={{ color: STUDIO_THEME.muted }}>Obliczanie oceny jakości...</p>}
          {qualityScoresQuery.isError && (
            <p style={{ color: STUDIO_THEME.danger }}>
              Nie udało się odczytać oceny jakości.
              {' '}
              <button type="button" onClick={() => { void qualityScoresQuery.refetch(); }}>
                Spróbuj ponownie
              </button>
            </p>
          )}
          {qualityScores && (
            <>
              <p style={{ marginTop: 0, color: STUDIO_THEME.title }}>
                Przeliczono {formatNumber(qualityScores.total)} filmów dla zakresu {qualityScores.dateFrom} - {qualityScores.dateTo}.
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                {qualityScores.items.map((item, index) => {
                  const confidenceColor = item.confidence === 'high'
                    ? STUDIO_THEME.success
                    : item.confidence === 'medium'
                      ? STUDIO_THEME.warning
                      : STUDIO_THEME.muted;
                  return (
                    <article
                      key={`quality-score-${item.videoId}`}
                      style={{
                        border: `1px solid ${STUDIO_THEME.border}`,
                        borderRadius: 10,
                        background: STUDIO_THEME.panel,
                        padding: 10,
                      }}
                    >
                      <p style={{ margin: 0 }}>
                        <strong>#{index + 1} {item.title}</strong> | wynik: <strong>{item.score.toFixed(2)}</strong>
                      </p>
                      <p style={{ margin: '4px 0', color: STUDIO_THEME.muted, fontSize: 13 }}>
                        ID: {item.videoId} | dni danych: {formatNumber(item.daysWithData)} | pewność:{' '}
                        <span style={{ color: confidenceColor }}>{getQualityConfidenceLabel(item.confidence)}</span>
                      </p>
                      <p style={{ margin: '4px 0 0', color: STUDIO_THEME.muted, fontSize: 13 }}>
                        dynamika: {formatPercent(item.components.velocity)} | efektywność: {formatPercent(item.components.efficiency)} | zaangażowanie:{' '}
                        {formatPercent(item.components.engagement)} | retencja: {formatPercent(item.components.retention)} | stabilność:{' '}
                        {formatPercent(item.components.consistency)}
                      </p>
                    </article>
                  );
                })}
                {qualityScores.items.length === 0 && (
                  <p style={{ margin: 0, color: STUDIO_THEME.muted }}>Brak filmów do oceny jakości dla wybranego zakresu.</p>
                )}
              </div>
            </>
          )}
        </div>

        <div
          style={{
            marginTop: 12,
            border: `1px solid ${STUDIO_THEME.border}`,
            borderRadius: 16,
            background: STUDIO_THEME.panelElevated,
            padding: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0, color: STUDIO_THEME.text }}>Analiza konkurencji (Faza 14)</h3>
              <p style={{ marginTop: 6, marginBottom: 0, color: STUDIO_THEME.muted }}>
                Porównanie tempa wzrostu, częstotliwości publikacji, udziału rynku i wykrytych hitów konkurencji.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isCompetitorSyncDisabled) {
                  return;
                }
                syncCompetitorsMutation.mutate({
                  channelId,
                  dateFrom: dateRange.dateFrom,
                  dateTo: dateRange.dateTo,
                  competitorCount: 3,
                });
              }}
              disabled={isCompetitorSyncDisabled}
            >
              {syncCompetitorsMutation.isPending ? 'Synchronizacja konkurencji...' : 'Synchronizuj konkurencję'}
            </button>
          </div>

          {syncCompetitorsMutation.isError && (
            <p style={{ color: STUDIO_THEME.danger, marginBottom: 0 }}>
              {readMutationErrorMessage(syncCompetitorsMutation.error, 'Nie udało się zsynchronizować konkurencji.')}
            </p>
          )}
          {syncCompetitorsMutation.isSuccess && (
            <p style={{ color: STUDIO_THEME.title, marginBottom: 0 }}>
              Zsynchronizowano {formatNumber(syncCompetitorsMutation.data.competitorsSynced)} kanały konkurencji; przetworzono{' '}
              {formatNumber(syncCompetitorsMutation.data.snapshotsProcessed)} snapshotów.
            </p>
          )}

          {competitorInsightsQuery.isLoading && <p style={{ color: STUDIO_THEME.muted }}>Ładowanie analizy konkurencji...</p>}
          {competitorInsightsQuery.isError && (
            <p style={{ color: STUDIO_THEME.danger }}>
              Nie udało się odczytać analizy konkurencji.
              {' '}
              <button type="button" onClick={() => { void competitorInsightsQuery.refetch(); }}>
                Spróbuj ponownie
              </button>
            </p>
          )}

          {competitorInsights && (
            <>
              <p style={{ marginTop: 8, marginBottom: 10, color: STUDIO_THEME.title }}>
                Benchmark kanału: średnio {formatNumber(competitorInsights.ownerBenchmark.avgViewsPerDay)} wyświetleń dziennie | wzrost{' '}
                {formatPercent(competitorInsights.ownerBenchmark.growthRate)} | publikacje/tydzień:{' '}
                {competitorInsights.ownerBenchmark.uploadsPerWeek.toFixed(2)}
              </p>

              {competitorInsights.totalCompetitors < 3 && (
                <p style={{ marginTop: 0, color: STUDIO_THEME.warning }}>
                  Brak pełnego porównania. Zsynchronizuj konkurencję, aby zobaczyć minimum 3 kanały.
                </p>
              )}

              <div style={{ display: 'grid', gap: 8 }}>
                {competitorInsights.items.map((item, index) => (
                  <article
                    key={`competitor-${item.competitorChannelId}`}
                    style={{
                      border: `1px solid ${STUDIO_THEME.border}`,
                      borderRadius: 10,
                      background: STUDIO_THEME.panel,
                      padding: 10,
                    }}
                  >
                    <p style={{ margin: 0 }}>
                      <strong>#{index + 1} {item.name}</strong> ({item.competitorChannelId}) | momentum: <strong>{item.momentumScore.toFixed(2)}</strong>
                    </p>
                    <p style={{ margin: '4px 0', color: STUDIO_THEME.muted, fontSize: 13 }}>
                      udział rynku: {formatPercent(item.marketShare)} | względny wzrost: {formatPercent(item.relativeGrowth)} | publikacje/tydzień:{' '}
                      {item.uploadsPerWeek.toFixed(2)} | różnica publikacji: {item.uploadFrequencyDelta.toFixed(2)}
                    </p>
                    <p style={{ margin: '4px 0 0', color: STUDIO_THEME.muted, fontSize: 13 }}>
                      dni danych: {formatNumber(item.daysWithData)} | średnie wyświetlenia/dzień: {formatNumber(item.avgViewsPerDay)} | hity:{' '}
                      {formatNumber(item.hitCount)}{item.lastHitDate ? ` (ostatni: ${item.lastHitDate})` : ''}
                    </p>
                  </article>
                ))}
                {competitorInsights.items.length === 0 && (
                  <p style={{ margin: 0, color: STUDIO_THEME.muted }}>
                    Brak danych konkurencji dla wybranego zakresu. Uruchom synchronizację konkurencji.
                  </p>
                )}
              </div>

              <div style={{ marginTop: 10 }}>
                <h4 style={{ margin: '0 0 6px 0' }}>Wykryte hity konkurencji</h4>
                {competitorInsights.hits.length === 0 && (
                  <p style={{ margin: 0, color: STUDIO_THEME.muted }}>Brak hitów (&gt; 3 sigma) w wybranym zakresie.</p>
                )}
                {competitorInsights.hits.length > 0 && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {competitorInsights.hits.slice(0, 6).map((hit) => (
                      <p key={`${hit.competitorChannelId}-${hit.date}`} style={{ margin: 0, color: STUDIO_THEME.title }}>
                        <strong>{hit.competitorName}</strong> | {hit.date} | wyświetlenia: {formatNumber(hit.views)} | próg:{' '}
                        {formatNumber(hit.threshold)} | z-score: {hit.zScore.toFixed(2)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div
          style={{
            marginTop: 12,
            border: `1px solid ${STUDIO_THEME.border}`,
            borderRadius: 16,
            background: STUDIO_THEME.panelElevated,
            padding: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0, color: STUDIO_THEME.text }}>Analiza tematów (Faza 15)</h3>
              <p style={{ marginTop: 6, marginBottom: 0, color: STUDIO_THEME.muted }}>
                Klasteryzacja tematów i wykrywanie luk contentowych względem ciśnienia niszy.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isTopicIntelligenceRunDisabled) {
                  return;
                }
                runTopicIntelligenceMutation.mutate({
                  channelId,
                  dateFrom: dateRange.dateFrom,
                  dateTo: dateRange.dateTo,
                  clusterLimit: topicClusterLimit,
                  gapLimit: topicGapLimit,
                });
              }}
              disabled={isTopicIntelligenceRunDisabled}
            >
              {runTopicIntelligenceMutation.isPending ? 'Przeliczanie tematów...' : 'Przelicz tematykę'}
            </button>
          </div>

          {runTopicIntelligenceMutation.isError && (
            <p style={{ color: STUDIO_THEME.danger, marginBottom: 0 }}>
              {readMutationErrorMessage(runTopicIntelligenceMutation.error, 'Nie udało się przeliczyć analizy tematów.')}
            </p>
          )}

          {topicIntelligenceQuery.isLoading && <p style={{ color: STUDIO_THEME.muted }}>Ładowanie analizy tematów...</p>}
          {topicIntelligenceQuery.isError && (
            <p style={{ color: STUDIO_THEME.danger }}>
              Nie udało się odczytać analizy tematów.
              {' '}
              <button type="button" onClick={() => { void topicIntelligenceQuery.refetch(); }}>
                Spróbuj ponownie
              </button>
            </p>
          )}

          {topicIntelligence && (
            <>
              <p style={{ marginTop: 8, marginBottom: 10, color: STUDIO_THEME.title }}>
                Zakres: {topicIntelligence.dateFrom} - {topicIntelligence.dateTo} | klastrów: {formatNumber(topicIntelligence.totalClusters)} | luk: {formatNumber(topicIntelligence.gaps.length)}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
                <section
                  style={{
                    border: `1px solid ${STUDIO_THEME.border}`,
                    borderRadius: 10,
                    background: STUDIO_THEME.panel,
                    padding: 10,
                  }}
                >
                  <h4 style={{ margin: '0 0 8px 0' }}>Największe luki tematyczne</h4>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {topicIntelligence.gaps.map((gap, index) => (
                      <article
                        key={`topic-gap-${gap.clusterId}`}
                        style={{
                          border: `1px solid ${STUDIO_THEME.border}`,
                          borderRadius: 8,
                          background: STUDIO_THEME.panelElevated,
                          padding: 8,
                        }}
                      >
                        <p style={{ margin: 0 }}>
                          <strong>#{index + 1} {gap.label}</strong> | wynik luki: <strong>{gap.gapScore.toFixed(2)}</strong>
                        </p>
                        <p style={{ margin: '4px 0', color: STUDIO_THEME.muted, fontSize: 13 }}>
                          trend: {getTopicTrendDirectionLabel(gap.trendDirection)} | ciśnienie niszy: {gap.nichePressure.toFixed(2)} | pokrycie kanału:{' '}
                          {formatPercent(gap.ownerCoverage)}
                        </p>
                        <p style={{ margin: '4px 0', color: STUDIO_THEME.muted, fontSize: 13 }}>
                          ryzyko kanibalizacji: {formatPercent(gap.cannibalizationRisk)} | pewność: {getTopicConfidenceLabel(gap.confidence)}
                        </p>
                        <p style={{ margin: '4px 0 0', color: STUDIO_THEME.title, fontSize: 13 }}>
                          {gap.rationale}
                        </p>
                      </article>
                    ))}
                    {topicIntelligence.gaps.length === 0 && (
                      <p style={{ margin: 0, color: STUDIO_THEME.muted }}>
                        Brak luk tematycznych dla wybranego zakresu.
                      </p>
                    )}
                  </div>
                </section>

                <section
                  style={{
                    border: `1px solid ${STUDIO_THEME.border}`,
                    borderRadius: 10,
                    background: STUDIO_THEME.panel,
                    padding: 10,
                  }}
                >
                  <h4 style={{ margin: '0 0 8px 0' }}>Klastry tematów i trend</h4>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {topicIntelligence.clusters.map((cluster) => (
                      <article
                        key={`topic-cluster-${cluster.clusterId}`}
                        style={{
                          border: `1px solid ${STUDIO_THEME.border}`,
                          borderRadius: 8,
                          background: STUDIO_THEME.panelElevated,
                          padding: 8,
                        }}
                      >
                        <p style={{ margin: 0 }}>
                          <strong>{cluster.label}</strong> | filmy: {formatNumber(cluster.videos)} | trend: {getTopicTrendDirectionLabel(cluster.trendDirection)}
                        </p>
                        <p style={{ margin: '4px 0', color: STUDIO_THEME.muted, fontSize: 13 }}>
                          wyświetlenia kanału: {formatNumber(cluster.ownerViewsTotal)} | wyświetlenia konkurencji:{' '}
                          {formatNumber(cluster.competitorViewsTotal)}
                        </p>
                        <p style={{ margin: '4px 0', color: STUDIO_THEME.muted, fontSize: 13 }}>
                          udział kanału: {formatPercent(cluster.ownerShare)} | udział niszy: {formatPercent(cluster.nicheShare)} | delta trendu:{' '}
                          {cluster.trendDelta.toFixed(2)}
                        </p>
                        <p style={{ margin: '4px 0 0', color: STUDIO_THEME.title, fontSize: 13 }}>
                          słowa kluczowe: {cluster.keywords.join(', ')}
                        </p>
                      </article>
                    ))}
                    {topicIntelligence.clusters.length === 0 && (
                      <p style={{ margin: 0, color: STUDIO_THEME.muted }}>
                        Brak klastrów tematów dla wybranego zakresu.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </>
          )}
        </div>

        <div
          style={{
            marginTop: 12,
            border: `1px solid ${STUDIO_THEME.border}`,
            borderRadius: 16,
            background: STUDIO_THEME.panelElevated,
            padding: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0, color: STUDIO_THEME.text }}>System planowania (Faza 16)</h3>
              <p style={{ marginTop: 6, marginBottom: 0, color: STUDIO_THEME.muted }}>
                Deterministyczny plan publikacji oparty o quality scoring, konkurencję i luki tematyczne.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isPlanningGenerateDisabled) {
                  return;
                }
                generatePlanningPlanMutation.mutate({
                  channelId,
                  dateFrom: dateRange.dateFrom,
                  dateTo: dateRange.dateTo,
                  maxRecommendations: 7,
                  clusterLimit: topicClusterLimit,
                  gapLimit: topicGapLimit,
                });
              }}
              disabled={isPlanningGenerateDisabled}
            >
              {generatePlanningPlanMutation.isPending ? 'Generowanie planu...' : 'Generuj plan publikacji'}
            </button>
          </div>

          {generatePlanningPlanMutation.isError && (
            <p style={{ color: STUDIO_THEME.danger, marginBottom: 0 }}>
              {readMutationErrorMessage(generatePlanningPlanMutation.error, 'Nie udało się wygenerować planu publikacji.')}
            </p>
          )}

          {planningPlanQuery.isLoading && <p style={{ color: STUDIO_THEME.muted }}>Ładowanie planu publikacji...</p>}
          {planningPlanQuery.isError && (
            <p style={{ color: STUDIO_THEME.danger }}>
              Nie udało się odczytać planu publikacji.
              {' '}
              <button type="button" onClick={() => { void planningPlanQuery.refetch(); }}>
                Spróbuj ponownie
              </button>
            </p>
          )}

          {planningPlan && (
            <>
              <p style={{ marginTop: 8, marginBottom: 10, color: STUDIO_THEME.title }}>
                Plan: {planningPlan.planId} | wygenerowano: {new Date(planningPlan.generatedAt).toLocaleString('pl-PL')} | rekomendacje:{' '}
                {formatNumber(planningPlan.totalRecommendations)}
              </p>

              <div style={{ display: 'grid', gap: 8 }}>
                {planningPlan.items.map((item) => {
                  const confidenceColor = item.confidence === 'high'
                    ? STUDIO_THEME.success
                    : item.confidence === 'medium'
                      ? STUDIO_THEME.warning
                      : STUDIO_THEME.muted;
                  return (
                    <article
                      key={item.recommendationId}
                      style={{
                        border: `1px solid ${STUDIO_THEME.border}`,
                        borderRadius: 10,
                        background: STUDIO_THEME.panel,
                        padding: 10,
                      }}
                    >
                      <p style={{ margin: 0 }}>
                        <strong>#{item.slotOrder}</strong> | slot: <strong>{item.slotDate}</strong> | temat: <strong>{item.topicLabel}</strong> | wynik:{' '}
                        <strong>{item.priorityScore.toFixed(2)}</strong> | pewność:{' '}
                        <span style={{ color: confidenceColor }}>{getPlanningConfidenceLabel(item.confidence)}</span>
                      </p>
                      <p style={{ margin: '4px 0', color: STUDIO_THEME.title, fontSize: 13 }}>
                        Proponowany tytuł: {item.suggestedTitle}
                      </p>
                      <p style={{ margin: '4px 0', color: STUDIO_THEME.muted, fontSize: 13 }}>
                        {item.rationale}
                      </p>
                      <div style={{ marginTop: 6 }}>
                        <p style={{ margin: '0 0 4px', color: STUDIO_THEME.muted, fontSize: 12 }}>
                          Dowody:
                        </p>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {item.evidence.map((evidence) => (
                            <li key={evidence.evidenceId} style={{ color: STUDIO_THEME.title, fontSize: 12 }}>
                              [{evidence.source}] {evidence.label}: {evidence.value}{evidence.context ? ` (${evidence.context})` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {item.warnings.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <p style={{ margin: '0 0 4px', color: STUDIO_THEME.warning, fontSize: 12 }}>
                            Ostrzeżenia:
                          </p>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {item.warnings.map((warning) => (
                              <li key={`${item.recommendationId}-${warning}`} style={{ color: STUDIO_THEME.warning, fontSize: 12 }}>
                                {warning}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </article>
                  );
                })}
                {planningPlan.items.length === 0 && (
                  <p style={{ margin: 0, color: STUDIO_THEME.muted }}>
                    Brak rekomendacji dla wybranego zakresu. Uzupełnij dane i wygeneruj plan ponownie.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div
          style={{
            marginTop: 12,
            border: `1px solid ${STUDIO_THEME.border}`,
            borderRadius: 16,
            background: STUDIO_THEME.panelElevated,
            padding: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0, color: STUDIO_THEME.text }}>Diagnostyka i naprawa (Faza 18)</h3>
              <p style={{ marginTop: 6, marginBottom: 0, color: STUDIO_THEME.muted }}>
                Kontrola stanu modułów DB/cache/pipeline/IPC oraz bezpieczne akcje naprawcze.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  void diagnosticsHealthQuery.refetch();
                }}
                disabled={!dataEnabled || diagnosticsHealthQuery.isFetching}
              >
                {diagnosticsHealthQuery.isFetching ? 'Odświeżanie...' : 'Odśwież kontrolę stanu'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isDiagnosticsRecoveryDisabled) {
                    return;
                  }
                  runDiagnosticsRecoveryMutation.mutate({
                    channelId,
                    dateFrom: dateRange.dateFrom,
                    dateTo: dateRange.dateTo,
                    actions: DEFAULT_DIAGNOSTICS_RECOVERY_ACTIONS,
                  });
                }}
                disabled={isDiagnosticsRecoveryDisabled}
              >
                {runDiagnosticsRecoveryMutation.isPending ? 'Uruchamianie naprawy...' : 'Uruchom naprawę'}
              </button>
            </div>
          </div>

          {diagnosticsHealthQuery.isLoading && <p style={{ color: STUDIO_THEME.muted }}>Ładowanie diagnostyki...</p>}
          {diagnosticsHealthQuery.isError && (
            <p style={{ color: STUDIO_THEME.danger }}>
              Nie udało się odczytać diagnostyki.
              {' '}
              <button type="button" onClick={() => { void diagnosticsHealthQuery.refetch(); }}>
                Spróbuj ponownie
              </button>
            </p>
          )}

          {runDiagnosticsRecoveryMutation.isPending && (
            <p style={{ color: STUDIO_THEME.muted, marginBottom: 0 }}>
              Trwa wykonywanie akcji naprawczych...
            </p>
          )}
          {runDiagnosticsRecoveryMutation.isError && (
            <p style={{ color: STUDIO_THEME.danger, marginBottom: 0 }}>
              {readMutationErrorMessage(runDiagnosticsRecoveryMutation.error, 'Nie udało się uruchomić naprawy.')}
            </p>
          )}

          {diagnosticsHealth && (
            <>
              <p style={{ marginTop: 8, marginBottom: 10, color: STUDIO_THEME.title }}>
                Stan ogólny:{' '}
                <strong style={{ color: getDiagnosticsStatusColor(diagnosticsHealth.overallStatus) }}>
                  {getDiagnosticsHealthStatusLabel(diagnosticsHealth.overallStatus)}
                </strong>{' '}
                | wygenerowano: {new Date(diagnosticsHealth.generatedAt).toLocaleString('pl-PL')}
              </p>

              <div style={{ display: 'grid', gap: 8 }}>
                {diagnosticsHealth.checks.map((check) => (
                  <article
                    key={check.checkId}
                    style={{
                      border: `1px solid ${STUDIO_THEME.border}`,
                      borderRadius: 10,
                      background: STUDIO_THEME.panel,
                      padding: 10,
                    }}
                  >
                    <p style={{ margin: 0 }}>
                      <strong>{check.checkId}</strong> ({check.module}) | stan:{' '}
                      <span style={{ color: getDiagnosticsStatusColor(check.status) }}>
                        {getDiagnosticsHealthStatusLabel(check.status)}
                      </span>{' '}
                      | czas: {check.durationMs} ms
                    </p>
                    <p style={{ margin: '4px 0 0', color: STUDIO_THEME.muted, fontSize: 13 }}>{check.message}</p>
                  </article>
                ))}
              </div>
            </>
          )}

          {diagnosticsRecoveryResult && (
            <div style={{ marginTop: 10 }}>
              <p style={{ margin: 0, color: STUDIO_THEME.title }}>
                Ostatnia naprawa:{' '}
                <strong
                  style={{
                    color: diagnosticsRecoveryResult.overallStatus === 'ok'
                      ? STUDIO_THEME.success
                      : diagnosticsRecoveryResult.overallStatus === 'partial'
                        ? STUDIO_THEME.warning
                        : STUDIO_THEME.danger,
                  }}
                >
                  {getDiagnosticsRecoveryStatusLabel(diagnosticsRecoveryResult.overallStatus)}
                </strong>
                {' '}| akcje: {diagnosticsRecoveryResult.requestedActions.map((action) => getDiagnosticsActionLabel(action)).join(', ')}
              </p>
              <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 18 }}>
                {diagnosticsRecoveryResult.steps.map((step) => (
                  <li key={`${step.action}-${step.status}-${step.durationMs}`} style={{ color: STUDIO_THEME.title }}>
                    {getDiagnosticsActionLabel(step.action)}: {' '}
                    <span style={{ color: getDiagnosticsStatusColor(step.status) }}>
                      {getDiagnosticsStepStatusLabel(step.status)}
                    </span>
                    {' '}({step.durationMs} ms)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
      )}

      {activeTab === 'assistant' && (
      <section style={{ marginBottom: '1.5rem', padding: '1rem', border: `1px solid ${STUDIO_THEME.border}`, borderRadius: 16, background: STUDIO_THEME.panel }}>
        <h2 style={{ marginTop: 0 }}>Asystent AI (Lite)</h2>
        <p style={{ color: STUDIO_THEME.title }}>
          Odpowiedzi są budowane tylko z danych SQLite przez whitelistowane narzędzia tylko do odczytu.
        </p>
        <div className="assistant-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 12 }}>
          <aside style={{ border: `1px solid ${STUDIO_THEME.border}`, borderRadius: 12, padding: 10, background: STUDIO_THEME.panelElevated }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Wątki</h3>
            {assistantThreadsQuery.isLoading && <p style={{ margin: 0 }}>Ładowanie wątków...</p>}
            {assistantThreadsQuery.isError && (
              <p style={{ margin: 0, color: STUDIO_THEME.danger }}>
                Nie udało się odczytać wątków.
                {' '}
                <button type="button" onClick={() => { void assistantThreadsQuery.refetch(); }}>
                  Spróbuj ponownie
                </button>
              </p>
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              {assistantThreads.map((thread) => (
                <button
                  key={thread.threadId}
                  type="button"
                  onClick={() => {
                    setActiveAssistantThreadId(thread.threadId);
                    setIsCreatingNewThread(false);
                  }}
                  style={{
                    textAlign: 'left',
                    borderRadius: 10,
                    border: `1px solid ${activeAssistantThreadId === thread.threadId ? STUDIO_THEME.accent : STUDIO_THEME.border}`,
                    background: activeAssistantThreadId === thread.threadId ? '#1f2f46' : STUDIO_THEME.panel,
                    padding: '0.55rem 0.6rem',
                  }}
                >
                  <div style={{ fontWeight: 700, color: STUDIO_THEME.text }}>{thread.title}</div>
                  <div style={{ color: STUDIO_THEME.muted, fontSize: 12 }}>
                    {thread.lastQuestion ?? 'Brak pytania'}
                  </div>
                </button>
              ))}
              {assistantThreads.length === 0 && !assistantThreadsQuery.isLoading && (
                <p style={{ margin: 0, color: STUDIO_THEME.muted }}>Brak zapisanych wątków.</p>
              )}
            </div>
          </aside>

          <div style={{ border: `1px solid ${STUDIO_THEME.border}`, borderRadius: 12, padding: 10, background: STUDIO_THEME.panelElevated }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Rozmowa</h3>
            {assistantThreadMessagesQuery.isLoading && activeAssistantThreadId && <p>Ładowanie historii...</p>}
            {assistantThreadMessagesQuery.isError && (
              <p style={{ color: STUDIO_THEME.danger }}>
                Nie udało się odczytać historii wątku.
                {' '}
                <button type="button" onClick={() => { void assistantThreadMessagesQuery.refetch(); }}>
                  Spróbuj ponownie
                </button>
              </p>
            )}

            <div className="assistant-messages" style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto', marginBottom: 12 }}>
              {assistantMessages.map((message) => (
                <article
                  key={`assistant-message-${message.messageId}`}
                  style={{
                    border: `1px solid ${STUDIO_THEME.border}`,
                    borderRadius: 10,
                    padding: 10,
                    background: message.role === 'assistant' ? '#172231' : STUDIO_THEME.panel,
                  }}
                >
                  <p style={{ margin: '0 0 4px', color: STUDIO_THEME.muted, fontSize: 12 }}>
                    {message.role === 'assistant' ? 'Asystent' : 'Ty'} | {new Date(message.createdAt).toLocaleString('pl-PL')}
                    {message.confidence ? ` | pewność: ${getPlanningConfidenceLabel(message.confidence)}` : ''}
                  </p>
                  <p style={{ margin: 0 }}>{message.text}</p>
                  {message.evidence.length > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer' }}>Dowody ({message.evidence.length})</summary>
                      <ul style={{ marginTop: 8, marginBottom: 0 }}>
                        {message.evidence.map((evidenceItem) => (
                          <li key={evidenceItem.evidenceId}>
                            <strong>{evidenceItem.label}</strong>: {evidenceItem.value}{' '}
                            <span style={{ color: STUDIO_THEME.muted }}>
                              [{evidenceItem.sourceTable}{' -> '}{evidenceItem.sourceRecordId}]
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {message.followUpQuestions.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {message.followUpQuestions.map((followUpQuestion) => (
                        <button
                          key={`${message.messageId}-${followUpQuestion}`}
                          type="button"
                          onClick={() => {
                            setAssistantQuestion(followUpQuestion);
                          }}
                          style={{ padding: '0.35rem 0.55rem', fontSize: 12 }}
                        >
                          {followUpQuestion}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ))}
              {assistantMessages.length === 0 && (
                <p style={{ margin: 0, color: STUDIO_THEME.muted }}>
                  Zacznij rozmowę: zadaj pytanie o wyniki kanału, filmy lub anomalie.
                </p>
              )}
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              Pytanie do asystenta
              <textarea
                value={assistantQuestion}
                onChange={(event) => {
                  setAssistantQuestion(event.target.value);
                }}
                rows={3}
                placeholder="Np. Jak szły moje filmy w ostatnim miesiącu?"
                style={{ width: '100%', resize: 'vertical' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={submitAssistantQuestion}
                disabled={askAssistantMutation.isPending || assistantQuestion.trim().length < 3}
              >
                {askAssistantMutation.isPending ? 'Analiza...' : 'Zapytaj asystenta'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveAssistantThreadId(null);
                  setIsCreatingNewThread(true);
                }}
              >
                Nowy wątek
              </button>
            </div>
            {askAssistantMutation.isError && (
              <p style={{ marginBottom: 0, color: STUDIO_THEME.danger }}>
                {readMutationErrorMessage(askAssistantMutation.error, 'Nie udało się uzyskać odpowiedzi asystenta.')}
              </p>
            )}
          </div>
        </div>
      </section>
      )}

      {activeTab === 'reports' && (
      <section style={{ marginBottom: '1.5rem', padding: '1rem', border: `1px solid ${STUDIO_THEME.border}`, borderRadius: 16, background: STUDIO_THEME.panel }}>
        <h2 style={{ marginTop: 0 }}>Raport i eksport</h2>
        <button
          type="button"
          onClick={() => {
            exportReportMutation.mutate({
              channelId,
              dateFrom: dateRange.dateFrom,
              dateTo: dateRange.dateTo,
              targetMetric: mlTargetMetric,
              formats: exportFormats,
            });
          }}
          disabled={!validRange || exportReportMutation.isPending}
          style={{ marginRight: 10 }}
        >
          Eksportuj raport (JSON/CSV/HTML)
        </button>
        <button
          type="button"
          onClick={() => {
            void reportQuery.refetch();
          }}
          disabled={!validRange || reportQuery.isFetching}
        >
          Odśwież raport
        </button>
        {exportReportMutation.isError && <p>Eksport raportu zakończył się błędem.</p>}
        {exportReportMutation.data && (
          <div style={{ marginTop: 10 }}>
            <p style={{ marginBottom: 6 }}>
              Raport wyeksportowano do: <code>{exportReportMutation.data.exportDir}</code>
            </p>
            <ul style={{ marginTop: 0 }}>
              {exportReportMutation.data.files.map((file) => (
                <li key={file.path}>
                  {file.kind} ({formatNumber(file.sizeBytes)} B)
                </li>
              ))}
            </ul>
          </div>
        )}

        {reportQuery.isLoading && <p>Generowanie raportu...</p>}
        {reportQuery.isError && (
          <p>
            Nie udało się wygenerować raportu.
            {' '}
            <button type="button" onClick={() => { void reportQuery.refetch(); }}>
              Spróbuj ponownie
            </button>
          </p>
        )}
        {report && (
          <>
            <h3>Wnioski</h3>
            <ul>
              {report.insights.map((insight) => (
                <li key={insight.code}>
                  <strong>{insight.title}:</strong> {insight.description}
                </li>
              ))}
            </ul>

            <h3>Najlepsze filmy</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ borderBottom: `1px solid ${STUDIO_THEME.border}`, textAlign: 'left', padding: '0.4rem' }}>Tytuł</th>
                    <th style={{ borderBottom: `1px solid ${STUDIO_THEME.border}`, textAlign: 'right', padding: '0.4rem' }}>Wyświetlenia</th>
                    <th style={{ borderBottom: `1px solid ${STUDIO_THEME.border}`, textAlign: 'right', padding: '0.4rem' }}>Polubienia</th>
                    <th style={{ borderBottom: `1px solid ${STUDIO_THEME.border}`, textAlign: 'right', padding: '0.4rem' }}>Komentarze</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topVideos.map((video) => (
                    <tr key={video.videoId}>
                      <td style={{ borderBottom: `1px solid ${STUDIO_THEME.border}`, padding: '0.4rem' }}>{video.title}</td>
                      <td style={{ borderBottom: `1px solid ${STUDIO_THEME.border}`, textAlign: 'right', padding: '0.4rem' }}>{formatNumber(video.viewCount)}</td>
                      <td style={{ borderBottom: `1px solid ${STUDIO_THEME.border}`, textAlign: 'right', padding: '0.4rem' }}>{formatNumber(video.likeCount)}</td>
                      <td style={{ borderBottom: `1px solid ${STUDIO_THEME.border}`, textAlign: 'right', padding: '0.4rem' }}>{formatNumber(video.commentCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      )}

      {activeTab === 'import' && (
      <section style={{ marginBottom: '1.5rem', padding: '1rem', border: `1px solid ${STUDIO_THEME.border}`, borderRadius: 16, background: STUDIO_THEME.panel }}>
        <h2 style={{ marginTop: 0 }}>Import CSV i wyszukiwanie treści (Faza 9)</h2>
        <p style={{ color: STUDIO_THEME.title }}>
          Import działa lokalnie: podgląd CSV, mapowanie kolumn, zapis do bazy i automatyczne uruchomienie pipeline.
        </p>

        <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            Nazwa źródła importu
            <input
              type="text"
              value={csvSourceName}
              onChange={(event) => {
                setCsvSourceName(event.target.value);
              }}
              placeholder="manual-csv"
            />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label>
              Separator:
              <select
                value={csvDelimiter}
                onChange={(event) => {
                  setCsvDelimiter(event.target.value as CsvImportDelimiter);
                }}
                style={{ marginLeft: 8 }}
              >
                <option value="auto">auto</option>
                <option value="comma">przecinek (,)</option>
                <option value="semicolon">średnik (;)</option>
                <option value="tab">tabulator</option>
              </select>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={csvHasHeader}
                onChange={(event) => {
                  setCsvHasHeader(event.target.checked);
                }}
              />
              CSV ma nagłówek
            </label>
          </div>
          <label style={{ display: 'grid', gap: 4 }}>
            Treść CSV
            <textarea
              value={csvText}
              onChange={(event) => {
                setCsvText(event.target.value);
              }}
              rows={10}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => {
              csvPreviewMutation.mutate({
                channelId,
                sourceName: csvSourceName.trim() || 'manual-csv',
                csvText,
                delimiter: csvDelimiter,
                hasHeader: csvHasHeader,
                previewRowsLimit: 8,
              });
            }}
            disabled={csvPreviewMutation.isPending || csvText.trim().length === 0}
          >
            Podgląd CSV
          </button>
          <button
            type="button"
            onClick={() => {
              if (!canRunCsvImport) {
                return;
              }
              csvImportMutation.mutate({
                channelId,
                sourceName: csvSourceName.trim() || 'manual-csv',
                csvText,
                delimiter: csvDelimiter,
                hasHeader: csvHasHeader,
                mapping: csvMapping as CsvImportColumnMappingDTO,
              });
            }}
            disabled={csvImportMutation.isPending || csvText.trim().length === 0 || !canRunCsvImport}
          >
            Importuj CSV i uruchom pipeline
          </button>
        </div>

        {csvPreviewMutation.isError && <p style={{ color: STUDIO_THEME.danger }}>Nie udało się przygotować podglądu CSV.</p>}
        {csvImportMutation.isError && <p style={{ color: STUDIO_THEME.danger }}>Import CSV zakończył się błędem.</p>}

        {csvPreviewMutation.data && (
          <>
            <p style={{ marginBottom: 8 }}>
              Wykryto separator: <strong>{csvPreviewMutation.data.detectedDelimiter}</strong>, wiersze: <strong>{formatNumber(csvPreviewMutation.data.rowsTotal)}</strong>
            </p>
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              {IMPORT_MAPPING_FIELDS.map((fieldConfig) => (
                <label key={fieldConfig.field} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ minWidth: 180 }}>
                    {fieldConfig.label} {fieldConfig.required ? '*' : ''}
                  </span>
                  <select
                    value={csvMapping[fieldConfig.field] ?? ''}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setCsvMapping((current) => ({
                        ...current,
                        [fieldConfig.field]: nextValue.length > 0 ? nextValue : undefined,
                      }));
                    }}
                  >
                    <option value="">(brak mapowania)</option>
                    {previewHeaders.map((header) => (
                      <option key={`${fieldConfig.field}-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {previewHeaders.map((header) => (
                      <th
                        key={`preview-header-${header}`}
                        style={{ borderBottom: `1px solid ${STUDIO_THEME.border}`, textAlign: 'left', padding: '0.4rem' }}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreviewMutation.data.sampleRows.map((row, rowIndex) => (
                    <tr key={`preview-row-${rowIndex}`}>
                      {previewHeaders.map((header) => (
                        <td
                          key={`preview-cell-${rowIndex}-${header}`}
                          style={{ borderBottom: `1px solid ${STUDIO_THEME.border}`, padding: '0.35rem 0.4rem' }}
                        >
                          {row[header] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {csvImportMutation.data && (
          <div style={{ marginBottom: 16, padding: 12, border: `1px solid ${STUDIO_THEME.border}`, borderRadius: 12, background: STUDIO_THEME.panelElevated }}>
            <p style={{ marginTop: 0 }}>
              Import #{csvImportMutation.data.importId}: poprawne wiersze {formatNumber(csvImportMutation.data.rowsValid)} / {formatNumber(csvImportMutation.data.rowsTotal)}
            </p>
            <p>
              Zakres dat: {csvImportMutation.data.importedDateFrom ?? 'brak'} - {csvImportMutation.data.importedDateTo ?? 'brak'} | Wygenerowane cechy pipeline: {formatNumber(csvImportMutation.data.pipelineFeatures)}
            </p>
            {csvImportMutation.data.validationIssues.length > 0 && (
              <>
                <p style={{ marginBottom: 6 }}>Problemy walidacji ({formatNumber(csvImportMutation.data.validationIssues.length)}):</p>
                <ul style={{ marginTop: 0 }}>
                  {csvImportMutation.data.validationIssues.slice(0, 12).map((issue) => (
                    <li key={`issue-${issue.rowNumber}-${issue.column}-${issue.code}`}>
                      wiersz {issue.rowNumber}, kolumna {issue.column}: {issue.message} {issue.value ? `(wartość: ${issue.value})` : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <h3 style={{ marginBottom: 8 }}>Wyszukiwanie (FTS5)</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
            placeholder="Wpisz zapytanie, np. poradnik shorts"
            style={{ minWidth: 280, flex: 1 }}
          />
          <button
            type="button"
            onClick={() => {
              if (searchQuery.trim().length < 2) {
                return;
              }
              searchContentMutation.mutate({
                channelId,
                query: searchQuery.trim(),
                limit: 20,
              });
            }}
            disabled={searchContentMutation.isPending || searchQuery.trim().length < 2}
          >
            Szukaj
          </button>
        </div>
        {searchContentMutation.isError && <p style={{ color: STUDIO_THEME.danger }}>Nie udało się wykonać wyszukiwania.</p>}
        {searchContentMutation.data && (
          <>
            <p style={{ color: STUDIO_THEME.title }}>
              Wyniki: {formatNumber(searchContentMutation.data.total)} dla zapytania „{searchContentMutation.data.query}”.
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              {searchContentMutation.data.items.map((item) => (
                <article
                  key={item.documentId}
                  style={{
                    border: `1px solid ${STUDIO_THEME.border}`,
                    borderRadius: 12,
                    padding: 10,
                    background: STUDIO_THEME.panelElevated,
                  }}
                >
                  <p style={{ margin: 0, color: STUDIO_THEME.text }}>
                    <strong>{item.title}</strong> {item.videoId ? <span style={{ color: STUDIO_THEME.muted }}>(ID: {item.videoId})</span> : null}
                  </p>
                  <p style={{ margin: '4px 0', color: STUDIO_THEME.muted, fontSize: 13 }}>
                    Źródło: {item.source} | Publikacja: {item.publishedAt ?? 'brak'} | Wynik: {item.score.toFixed(3)}
                  </p>
                  <p style={{ margin: 0 }}>{item.snippet}</p>
                </article>
              ))}
              {searchContentMutation.data.items.length === 0 && <p>Brak wyników.</p>}
            </div>
          </>
        )}
      </section>
      )}

      {activeTab === 'settings' && (
      <details style={{ padding: '1rem', border: `1px solid ${STUDIO_THEME.border}`, borderRadius: 16, background: STUDIO_THEME.panel }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Narzędzia techniczne (Faza 3/5/6)</summary>

        <div style={{ marginTop: 12 }}>
          <h3>Orkiestracja synchronizacji</h3>
          <button
            type="button"
            onClick={startSyncRun}
            disabled={startSyncMutation.isPending || syncRunning}
            style={{ marginRight: '0.5rem' }}
          >
            Uruchom synchronizację
          </button>
          <button
            type="button"
            onClick={() => {
              if (!resumeSyncRunId) {
                return;
              }
              resumeSyncMutation.mutate({
                syncRunId: resumeSyncRunId,
                channelId,
                recentLimit: 10,
              });
            }}
            disabled={resumeSyncMutation.isPending || syncRunning || resumeSyncRunId === null}
          >
            Wznów ostatnią nieudaną synchronizację
          </button>
          {startSyncMutation.isError && <p>Nie udało się uruchomić synchronizacji.</p>}
          {resumeSyncMutation.isError && <p>Nie udało się wznowić synchronizacji.</p>}
          {lastProgressEvent && (
            <p>
              Postęp: {lastProgressEvent.percent}% ({lastProgressEvent.stage}) - {lastProgressEvent.message}
            </p>
          )}
          {lastCompleteEvent && (
            <p>
              Zakończono synchronizację #{lastCompleteEvent.syncRunId}. Rekordy: {formatNumber(lastCompleteEvent.recordsProcessed)}, czas: {formatNumber(Math.round(lastCompleteEvent.duration))} ms.
            </p>
          )}
          {lastErrorEvent && (
            <p>
              Błąd synchronizacji ({lastErrorEvent.code}): {lastErrorEvent.message} {lastErrorEvent.retryable ? '(możliwe ponowienie)' : '(wymagana interwencja)'}
            </p>
          )}

          <h3>Model bazowy ML</h3>
          <button
            type="button"
            onClick={() => {
              runMlMutation.mutate({
                channelId,
                targetMetric: mlTargetMetric,
                horizonDays: 7,
              });
            }}
            disabled={runMlMutation.isPending}
            style={{ marginRight: '0.5rem' }}
          >
            Uruchom trenowanie ML
          </button>
          {runMlMutation.isError && <p>Nie udało się uruchomić treningu ML.</p>}
          {runMlMutation.data && (
            <p>
              Trening ML: status={runMlMutation.data.status}, model={runMlMutation.data.activeModelType ?? 'brak'}, prognozy={formatNumber(runMlMutation.data.predictionsGenerated)}
            </p>
          )}
          {mlForecast && (
            <p>
              Ostatni model prognozy: {mlForecast.modelType ?? 'brak'} {mlForecast.modelType ? `| punktów: ${formatNumber(mlForecast.points.length)}` : ''}
            </p>
          )}

          <h3>Tryb danych</h3>
          {dataModeQuery.isLoading && <p>Odczyt trybu danych...</p>}
          {dataModeQuery.isError && <p>Nie udało się odczytać trybu danych.</p>}
          {modeStatus && (
            <>
              <p>Aktualny tryb: {modeStatus.mode}</p>
              <p style={{ marginTop: 0, color: STUDIO_THEME.muted }}>
                Dostępne tryby: {modeStatus.availableModes.map((mode) => dataModeLabel(mode)).join(', ')}
              </p>
              {ALL_DATA_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setModeMutation.mutate(mode);
                  }}
                  disabled={setModeMutation.isPending || !availableModes.has(mode)}
                  style={{
                    marginRight: '0.5rem',
                    opacity: availableModes.has(mode) ? 1 : 0.45,
                  }}
                >
                  Ustaw {dataModeLabel(mode)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  probeModeMutation.mutate({
                    channelId,
                    videoIds: ['VID-001', 'VID-002', 'VID-003'],
                    recentLimit: 5,
                  });
                }}
                disabled={probeModeMutation.isPending}
              >
                Sprawdzenie trybu danych
              </button>
            </>
          )}
          {setModeErrorMessage && <p>{setModeErrorMessage}</p>}
          {probeModeMutation.isError && <p>Sprawdzenie trybu danych zakończyło się błędem.</p>}
          {probeModeMutation.data && (
            <p>
              Sprawdzenie: dostawca={probeModeMutation.data.providerName}, ostatnie={probeModeMutation.data.recentVideos}, statystyki={probeModeMutation.data.videoStats}
            </p>
          )}
        </div>
      </details>
      )}

      <footer style={{ marginTop: '1.5rem', color: STUDIO_THEME.title }}>
        {channelInfoQuery.data
          ? `Kanał: ${channelInfoQuery.data.name} | Subskrypcje: ${formatNumber(channelInfoQuery.data.subscriberCount)} | Filmy: ${formatNumber(channelInfoQuery.data.videoCount)} | ER: ${kpis ? formatPercent(kpis.engagementRate) : 'brak danych'}`
          : 'Kanał testowy nie został jeszcze zsynchronizowany.'}
      </footer>
    </main>
  );
}









