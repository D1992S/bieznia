import { useEffect, useMemo, useState } from 'react';
import type {
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
  buildDateRange,
  isDateRangeValid,
  useAppStatusQuery,
  useChannelInfoQuery,
  useDashboardReportQuery,
  useDataModeStatusQuery,
  useExportDashboardReportMutation,
  useKpisQuery,
  useMlForecastQuery,
  useProbeDataModeMutation,
  useResumeSyncMutation,
  useRunMlBaselineMutation,
  useSetDataModeMutation,
  useStartSyncMutation,
  useTimeseriesQuery,
  type DateRange,
  type DateRangePreset,
} from './hooks/use-dashboard-data.ts';
import { useAppStore } from './store/index.ts';

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

const CHART_WIDTH = 980;
const CHART_HEIGHT = 320;
const CHART_PADDING = 34;

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pl-PL').format(Math.round(value));
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function deltaLabel(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value)}`;
}

function trendSymbol(value: number): string {
  if (value > 0) {
    return '↑';
  }
  if (value < 0) {
    return '↓';
  }
  return '→';
}

function mergeSeriesWithForecast(
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

function buildLinePath(
  points: ChartPoint[],
  picker: (point: ChartPoint) => number | null,
  valueToY: (value: number) => number,
  xForIndex: (index: number) => number,
): string {
  const filtered = points
    .map((point, index) => ({ x: xForIndex(index), y: picker(point) }))
    .filter((point): point is { x: number; y: number } => point.y !== null);

  if (filtered.length === 0) {
    return '';
  }

  return filtered
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${valueToY(point.y)}`)
    .join(' ');
}

function buildBandPolygon(
  points: ChartPoint[],
  valueToY: (value: number) => number,
  xForIndex: (index: number) => number,
): string {
  const forecast = points
    .map((point, index) => ({
      x: xForIndex(index),
      p10: point.p10,
      p90: point.p90,
    }))
    .filter((point): point is { x: number; p10: number; p90: number } => point.p10 !== null && point.p90 !== null);

  if (forecast.length < 2) {
    return '';
  }

  const upper = forecast.map((point) => `${point.x},${valueToY(point.p90)}`);
  const lower = [...forecast].reverse().map((point) => `${point.x},${valueToY(point.p10)}`);
  return [...upper, ...lower].join(' ');
}

function ForecastChart(props: {
  points: ChartPoint[];
  metricLabel: string;
}) {
  const values = props.points.flatMap((point) => [
    point.actual,
    point.p10,
    point.p50,
    point.p90,
  ]).filter((value): value is number => value !== null);

  if (props.points.length === 0 || values.length === 0) {
    return <p>Brak danych wykresu dla wybranego zakresu.</p>;
  }

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const minValue = Math.max(0, minimum * 0.9);
  const maxValue = maximum === minimum ? maximum + 1 : maximum * 1.1;
  const valueSpan = maxValue - minValue;
  const plotWidth = CHART_WIDTH - CHART_PADDING * 2;
  const plotHeight = CHART_HEIGHT - CHART_PADDING * 2;

  const xForIndex = (index: number): number => {
    if (props.points.length <= 1) {
      return CHART_PADDING + plotWidth / 2;
    }
    return CHART_PADDING + (plotWidth * index) / (props.points.length - 1);
  };

  const valueToY = (value: number): number => {
    return CHART_PADDING + plotHeight - ((value - minValue) / valueSpan) * plotHeight;
  };

  const actualPath = buildLinePath(props.points, (point) => point.actual, valueToY, xForIndex);
  const forecastPath = buildLinePath(props.points, (point) => point.p50, valueToY, xForIndex);
  const bandPolygon = buildBandPolygon(props.points, valueToY, xForIndex);

  const firstDate = props.points[0]?.date ?? '';
  const lastDate = props.points[props.points.length - 1]?.date ?? '';

  return (
    <div style={{ border: '1px solid #d2dae6', borderRadius: 12, background: '#ffffff', padding: 12 }}>
      <svg
        viewBox={`0 0 ${String(CHART_WIDTH)} ${String(CHART_HEIGHT)}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label={`Wykres ${props.metricLabel} z prognozą`}
      >
        <rect x={0} y={0} width={CHART_WIDTH} height={CHART_HEIGHT} fill="#f8fbff" />
        <line
          x1={CHART_PADDING}
          y1={CHART_HEIGHT - CHART_PADDING}
          x2={CHART_WIDTH - CHART_PADDING}
          y2={CHART_HEIGHT - CHART_PADDING}
          stroke="#c8d2df"
          strokeWidth={1}
        />
        <line
          x1={CHART_PADDING}
          y1={CHART_PADDING}
          x2={CHART_PADDING}
          y2={CHART_HEIGHT - CHART_PADDING}
          stroke="#c8d2df"
          strokeWidth={1}
        />
        {bandPolygon && (
          <polygon
            points={bandPolygon}
            fill="rgba(255, 122, 89, 0.18)"
            stroke="rgba(255, 122, 89, 0.35)"
            strokeWidth={1}
          />
        )}
        {actualPath && (
          <path d={actualPath} fill="none" stroke="#0e7490" strokeWidth={2.5} />
        )}
        {forecastPath && (
          <path d={forecastPath} fill="none" stroke="#ef4444" strokeWidth={2} strokeDasharray="6 4" />
        )}
        <text x={CHART_PADDING} y={CHART_PADDING - 10} fontSize={12} fill="#334155">
          max: {formatNumber(maximum)}
        </text>
        <text x={CHART_PADDING} y={CHART_HEIGHT - 10} fontSize={12} fill="#334155">
          min: {formatNumber(minimum)}
        </text>
        <text x={CHART_PADDING} y={CHART_HEIGHT - CHART_PADDING + 20} fontSize={12} fill="#334155">
          {firstDate}
        </text>
        <text x={CHART_WIDTH - CHART_PADDING - 70} y={CHART_HEIGHT - CHART_PADDING + 20} fontSize={12} fill="#334155">
          {lastDate}
        </text>
      </svg>
      <p style={{ marginTop: 10, marginBottom: 0, color: '#475569', fontSize: 13 }}>
        Linia niebieska: dane rzeczywiste, linia czerwona: prognoza p50, pas czerwony: przedział p10-p90.
      </p>
    </div>
  );
}

export function App() {
  const setInitialized = useAppStore((state) => state.setInitialized);
  const isDesktopRuntime = typeof window !== 'undefined' && Boolean(window.electronAPI);
  const [lastProgressEvent, setLastProgressEvent] = useState<SyncProgressEvent | null>(null);
  const [lastCompleteEvent, setLastCompleteEvent] = useState<SyncCompleteEvent | null>(null);
  const [lastErrorEvent, setLastErrorEvent] = useState<SyncErrorEvent | null>(null);
  const [resumeSyncRunId, setResumeSyncRunId] = useState<number | null>(null);
  const [datePreset, setDatePreset] = useState<DateRangePreset>('30d');
  const [customRange, setCustomRange] = useState<DateRange>(() => buildDateRange(30));
  const mlTargetMetric: MlTargetMetric = 'views';
  const exportFormats: ReportExportFormat[] = ['json', 'csv', 'html'];

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

  const channelId = DEFAULT_CHANNEL_ID;
  const validRange = isDateRangeValid(dateRange);

  const statusQuery = useAppStatusQuery();
  const dataModeQuery = useDataModeStatusQuery(isDesktopRuntime);
  const setModeMutation = useSetDataModeMutation();
  const probeModeMutation = useProbeDataModeMutation();
  const startSyncMutation = useStartSyncMutation();
  const resumeSyncMutation = useResumeSyncMutation();
  const runMlMutation = useRunMlBaselineMutation();
  const exportReportMutation = useExportDashboardReportMutation();

  const dataEnabled = isDesktopRuntime && statusQuery.data?.dbReady === true && validRange;
  const channelInfoQuery = useChannelInfoQuery(channelId, dataEnabled);
  const kpisQuery = useKpisQuery(channelId, dateRange, dataEnabled);
  const timeseriesQuery = useTimeseriesQuery(channelId, dateRange, 'views', dataEnabled);
  const mlForecastQuery = useMlForecastQuery(channelId, mlTargetMetric, dataEnabled);
  const reportQuery = useDashboardReportQuery(channelId, dateRange, mlTargetMetric, dataEnabled);

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

  if (!isDesktopRuntime) {
    return (
      <main style={{ padding: '2rem', fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif' }}>
        <h1>Mozetobedzieto</h1>
        <p>Uruchomiono sam interfejs web. Dane z backendu IPC są niedostępne.</p>
      </main>
    );
  }

  if (statusQuery.isLoading) {
    return (
      <main style={{ padding: '2rem', fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif' }}>
        <h1>Mozetobedzieto</h1>
        <p>Odczyt statusu aplikacji...</p>
      </main>
    );
  }

  if (statusQuery.isError || !statusQuery.data) {
    return (
      <main style={{ padding: '2rem', fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif' }}>
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

  const kpiCards: KpiCardData[] = kpis
    ? [
      { label: 'Wyświetlenia', value: kpis.views, delta: kpis.viewsDelta, tone: 'primary' },
      { label: 'Subskrypcje', value: kpis.subscribers, delta: kpis.subscribersDelta, tone: 'accent' },
      { label: 'Filmy', value: kpis.videos, delta: kpis.videosDelta, tone: 'neutral' },
      { label: 'Śr. wyświetleń / film', value: kpis.avgViewsPerVideo, delta: 0, tone: 'neutral' },
    ]
    : [];

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '2rem',
        background: 'linear-gradient(135deg, #f0f7ff 0%, #ffffff 45%, #eefcf8 100%)',
        fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
        color: '#1f2937',
      }}
    >
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ marginBottom: 6 }}>Mozetobedzieto - Dashboard (Faza 7)</h1>
        <p style={{ marginTop: 0, color: '#475569' }}>
          Status DB: {appStatus.dbReady ? 'Gotowa' : 'Niegotowa'} | Profil: {appStatus.profileId ?? 'Brak'} | Sync: {appStatus.syncRunning ? 'w trakcie' : 'bez aktywnego procesu'}
        </p>
        <p style={{ marginTop: 0, color: '#475569' }}>
          Ostatni sync: {appStatus.lastSyncAt ?? 'Brak'}
        </p>
      </header>

      <section style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #d7e2ef', borderRadius: 12, background: '#fff' }}>
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
                border: datePreset === preset ? '2px solid #0f766e' : '1px solid #cbd5e1',
                background: datePreset === preset ? '#e6fffa' : '#ffffff',
                color: '#0f172a',
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
        <p style={{ marginTop: 10, color: validRange ? '#0f766e' : '#b91c1c' }}>
          Aktywny zakres: {dateRange.dateFrom} - {dateRange.dateTo} {validRange ? '' : '(niepoprawny)'}
        </p>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2>KPI</h2>
        {kpisQuery.isLoading && <p>Liczenie KPI...</p>}
        {kpisQuery.isError && <p>Nie udało się pobrać KPI dla wybranego zakresu.</p>}
        {kpiCards.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            {kpiCards.map((card) => {
              const background = card.tone === 'primary'
                ? 'linear-gradient(160deg, #dff6ff 0%, #f4fbff 100%)'
                : card.tone === 'accent'
                  ? 'linear-gradient(160deg, #ebfff7 0%, #f8fffc 100%)'
                  : 'linear-gradient(160deg, #f5f7fa 0%, #ffffff 100%)';
              return (
                <article
                  key={card.label}
                  style={{
                    border: '1px solid #d2dae6',
                    borderRadius: 12,
                    padding: 12,
                    background,
                  }}
                >
                  <p style={{ margin: 0, color: '#475569', fontSize: 13 }}>{card.label}</p>
                  <p style={{ margin: '6px 0', fontSize: 24, fontWeight: 700 }}>{formatNumber(card.value)}</p>
                  <p style={{ margin: 0, color: card.delta > 0 ? '#0f766e' : card.delta < 0 ? '#b91c1c' : '#64748b' }}>
                    {trendSymbol(card.delta)} {deltaLabel(card.delta)}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2>Szereg czasowy + prognoza ML</h2>
        {timeseriesQuery.isLoading || mlForecastQuery.isLoading ? <p>Ładowanie wykresu...</p> : null}
        {timeseriesQuery.isError ? <p>Nie udało się odczytać szeregu czasowego.</p> : null}
        {mlForecastQuery.isError ? <p>Nie udało się odczytać prognozy ML.</p> : null}
        {chartPoints.length > 0 && <ForecastChart points={chartPoints} metricLabel="wyświetleń" />}
      </section>

      <section style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #d7e2ef', borderRadius: 12, background: '#fff' }}>
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
        {reportQuery.isError && <p>Nie udało się wygenerować raportu.</p>}
        {report && (
          <>
            <h3>Insighty</h3>
            <ul>
              {report.insights.map((insight) => (
                <li key={insight.code}>
                  <strong>{insight.title}:</strong> {insight.description}
                </li>
              ))}
            </ul>

            <h3>Top filmy</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ borderBottom: '1px solid #d7e2ef', textAlign: 'left', padding: '0.4rem' }}>Tytuł</th>
                    <th style={{ borderBottom: '1px solid #d7e2ef', textAlign: 'right', padding: '0.4rem' }}>Wyświetlenia</th>
                    <th style={{ borderBottom: '1px solid #d7e2ef', textAlign: 'right', padding: '0.4rem' }}>Polubienia</th>
                    <th style={{ borderBottom: '1px solid #d7e2ef', textAlign: 'right', padding: '0.4rem' }}>Komentarze</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topVideos.map((video) => (
                    <tr key={video.videoId}>
                      <td style={{ borderBottom: '1px solid #eef2f7', padding: '0.4rem' }}>{video.title}</td>
                      <td style={{ borderBottom: '1px solid #eef2f7', textAlign: 'right', padding: '0.4rem' }}>{formatNumber(video.viewCount)}</td>
                      <td style={{ borderBottom: '1px solid #eef2f7', textAlign: 'right', padding: '0.4rem' }}>{formatNumber(video.likeCount)}</td>
                      <td style={{ borderBottom: '1px solid #eef2f7', textAlign: 'right', padding: '0.4rem' }}>{formatNumber(video.commentCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <details style={{ padding: '1rem', border: '1px solid #d7e2ef', borderRadius: 12, background: '#ffffff' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Narzędzia techniczne (Faza 3/5/6)</summary>

        <div style={{ marginTop: 12 }}>
          <h3>Sync orchestrator</h3>
          <button
            type="button"
            onClick={() => {
              startSyncMutation.mutate({
                channelId,
                profileId: appStatus.profileId,
                recentLimit: 10,
              });
            }}
            disabled={startSyncMutation.isPending || appStatus.syncRunning}
            style={{ marginRight: '0.5rem' }}
          >
            Uruchom sync
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
            disabled={resumeSyncMutation.isPending || resumeSyncRunId === null}
          >
            Wznów ostatni nieudany sync
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
              Zakończono sync #{lastCompleteEvent.syncRunId}. Rekordy: {formatNumber(lastCompleteEvent.recordsProcessed)}, czas: {formatNumber(Math.round(lastCompleteEvent.duration))} ms.
            </p>
          )}
          {lastErrorEvent && (
            <p>
              Błąd sync ({lastErrorEvent.code}): {lastErrorEvent.message} {lastErrorEvent.retryable ? '(możliwe ponowienie)' : '(wymagana interwencja)'}
            </p>
          )}

          <h3>ML baseline</h3>
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
              <button
                type="button"
                onClick={() => {
                  setModeMutation.mutate('fake');
                }}
                disabled={setModeMutation.isPending}
                style={{ marginRight: '0.5rem' }}
              >
                Ustaw fake
              </button>
              <button
                type="button"
                onClick={() => {
                  setModeMutation.mutate('real');
                }}
                disabled={setModeMutation.isPending}
                style={{ marginRight: '0.5rem' }}
              >
                Ustaw real
              </button>
              <button
                type="button"
                onClick={() => {
                  setModeMutation.mutate('record');
                }}
                disabled={setModeMutation.isPending}
                style={{ marginRight: '0.5rem' }}
              >
                Ustaw record
              </button>
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
                Probe trybu danych
              </button>
            </>
          )}
          {setModeMutation.isError && <p>Nie udało się przełączyć trybu danych.</p>}
          {probeModeMutation.isError && <p>Probe trybu danych zakończył się błędem.</p>}
          {probeModeMutation.data && (
            <p>
              Probe: provider={probeModeMutation.data.providerName}, recent={probeModeMutation.data.recentVideos}, stats={probeModeMutation.data.videoStats}
            </p>
          )}
        </div>
      </details>

      <footer style={{ marginTop: '1.5rem', color: '#64748b' }}>
        {channelInfoQuery.data
          ? `Kanał: ${channelInfoQuery.data.name} | Subskrypcje: ${formatNumber(channelInfoQuery.data.subscriberCount)} | Filmy: ${formatNumber(channelInfoQuery.data.videoCount)} | ER: ${kpis ? formatPercent(kpis.engagementRate) : 'brak danych'}`
          : 'Kanał testowy nie został jeszcze zsynchronizowany.'}
      </footer>
    </main>
  );
}
