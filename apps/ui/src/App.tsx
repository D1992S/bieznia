import { useEffect, useMemo, useState } from 'react';
import type { SyncCompleteEvent, SyncErrorEvent, SyncProgressEvent } from '@moze/shared';
import { DEFAULT_CHANNEL_ID, buildDateRange, useAppStatusQuery, useChannelInfoQuery, useDataModeStatusQuery, useKpisQuery, useProbeDataModeMutation, useResumeSyncMutation, useSetDataModeMutation, useStartSyncMutation, useTimeseriesQuery } from './hooks/use-dashboard-data.ts';
import { useAppStore } from './store/index.ts';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pl-PL').format(value);
}

export function App() {
  const setInitialized = useAppStore((s) => s.setInitialized);
  const isDesktopRuntime = typeof window !== 'undefined' && Boolean(window.electronAPI);
  const [lastProgressEvent, setLastProgressEvent] = useState<SyncProgressEvent | null>(null);
  const [lastCompleteEvent, setLastCompleteEvent] = useState<SyncCompleteEvent | null>(null);
  const [lastErrorEvent, setLastErrorEvent] = useState<SyncErrorEvent | null>(null);
  const [resumeSyncRunId, setResumeSyncRunId] = useState<number | null>(null);
  const dateRange = useMemo(() => buildDateRange(30), []);
  const channelId = DEFAULT_CHANNEL_ID;

  const statusQuery = useAppStatusQuery();
  const dataModeQuery = useDataModeStatusQuery(isDesktopRuntime);
  const setModeMutation = useSetDataModeMutation();
  const probeModeMutation = useProbeDataModeMutation();
  const startSyncMutation = useStartSyncMutation();
  const resumeSyncMutation = useResumeSyncMutation();
  const dataEnabled = isDesktopRuntime && statusQuery.data?.dbReady === true;
  const channelInfoQuery = useChannelInfoQuery(channelId, dataEnabled);
  const kpisQuery = useKpisQuery(channelId, dateRange, dataEnabled);
  const timeseriesQuery = useTimeseriesQuery(channelId, dateRange, dataEnabled);

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
      <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1>Mozetobedzieto</h1>
        <p>Uruchomiono sam interfejs web. Dane z backendu IPC sa niedostepne.</p>
      </main>
    );
  }

  if (statusQuery.isLoading) {
    return (
      <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1>Mozetobedzieto</h1>
        <p>Odczyt statusu aplikacji...</p>
      </main>
    );
  }

  if (statusQuery.isError || !statusQuery.data) {
    return (
      <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1>Mozetobedzieto</h1>
        <p>Nie udalo sie odczytac statusu aplikacji.</p>
      </main>
    );
  }

  const appStatus = statusQuery.data;
  const modeStatus = dataModeQuery.data;
  const kpis = kpisQuery.data;
  const timeseries = timeseriesQuery.data;
  const latestPoint = timeseries?.points[timeseries.points.length - 1];

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Mozetobedzieto</h1>
      <p>Analityczna maszyna AI dla tworcow YouTube</p>
      <p>Status DB: {appStatus.dbReady ? 'Gotowa' : 'Niegotowa'}</p>
      <p>Aktywny profil: {appStatus.profileId ?? 'Brak'}</p>
      <p>Sync w trakcie: {appStatus.syncRunning ? 'Tak' : 'Nie'}</p>
      <p>Ostatni sync: {appStatus.lastSyncAt ?? 'Brak'}</p>

      <hr />

      <h2>Sync orchestrator (Faza 5)</h2>
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
        Wznow ostatni nieudany sync
      </button>
      {startSyncMutation.isError && <p>Nie udalo sie uruchomic synchronizacji.</p>}
      {resumeSyncMutation.isError && <p>Nie udalo sie wznowic synchronizacji.</p>}
      {lastProgressEvent && (
        <p>
          Postep: {lastProgressEvent.percent}% ({lastProgressEvent.stage}) - {lastProgressEvent.message}
        </p>
      )}
      {lastCompleteEvent && (
        <p>
          Zakonczono sync #{lastCompleteEvent.syncRunId}. Przetworzone rekordy: {formatNumber(lastCompleteEvent.recordsProcessed)}, czas: {formatNumber(Math.round(lastCompleteEvent.duration))} ms.
        </p>
      )}
      {lastErrorEvent && (
        <p>
          Blad sync ({lastErrorEvent.code}): {lastErrorEvent.message} {lastErrorEvent.retryable ? '(mozliwe ponowienie)' : '(wymagana interwencja)'}
        </p>
      )}

      <hr />

      <h2>Tryb danych (Faza 3)</h2>
      {dataModeQuery.isLoading && <p>Odczyt trybu danych...</p>}
      {dataModeQuery.isError && <p>Nie udalo sie odczytac trybu danych.</p>}
      {modeStatus && (
        <>
          <p>Aktualny tryb: {modeStatus.mode}</p>
          <p>Dostepne tryby: {modeStatus.availableModes.join(', ')}</p>
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
      {setModeMutation.isError && <p>Nie udalo sie przelaczyc trybu danych.</p>}
      {probeModeMutation.isError && <p>Probe trybu danych zakonczyl sie bledem.</p>}
      {probeModeMutation.data && (
        <p>
          Probe: provider={probeModeMutation.data.providerName}, recent={probeModeMutation.data.recentVideos}, stats={probeModeMutation.data.videoStats}, plik={probeModeMutation.data.recordFilePath ?? 'brak'}
        </p>
      )}

      <hr />

      <h2>Dane kanalu (IPC)</h2>
      {channelInfoQuery.isLoading && <p>Odczyt danych kanalu...</p>}
      {channelInfoQuery.isError && (
        <p>Nie znaleziono danych kanalu w bazie dla ID: {channelId}</p>
      )}
      {channelInfoQuery.data && (
        <>
          <p>Nazwa: {channelInfoQuery.data.name}</p>
          <p>Subskrypcje: {formatNumber(channelInfoQuery.data.subscriberCount)}</p>
          <p>Filmy: {formatNumber(channelInfoQuery.data.videoCount)}</p>
          <p>Wyswietlenia: {formatNumber(channelInfoQuery.data.viewCount)}</p>
        </>
      )}

      <hr />

      <h2>KPI (ostatnie 30 dni)</h2>
      {kpisQuery.isLoading && <p>Liczenie KPI...</p>}
      {kpisQuery.isError && <p>Nie udalo sie pobrac KPI.</p>}
      {kpis && (
        <>
          <p>Wyswietlenia: {formatNumber(kpis.views)}</p>
          <p>Zmiana wyswietlen: {formatNumber(kpis.viewsDelta)}</p>
          <p>Srednia wyswietlen na film: {formatNumber(Math.round(kpis.avgViewsPerVideo))}</p>
          <p>Engagement rate: {(kpis.engagementRate * 100).toFixed(2)}%</p>
        </>
      )}

      <hr />

      <h2>Timeseries (views/dzien)</h2>
      {timeseriesQuery.isLoading && <p>Odczyt szeregu czasowego...</p>}
      {timeseriesQuery.isError && <p>Nie udalo sie pobrac szeregu czasowego.</p>}
      {timeseries && (
        <>
          <p>Liczba punktow: {formatNumber(timeseries.points.length)}</p>
          <p>
            Ostatni punkt: {latestPoint ? `${latestPoint.date} -> ${formatNumber(latestPoint.value)}` : 'Brak danych'}
          </p>
        </>
      )}
    </main>
  );
}
