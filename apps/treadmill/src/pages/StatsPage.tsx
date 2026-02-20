import { useState, useMemo } from 'react';
import { StatsCharts, aggregateByDay } from '../components/StatsCharts.tsx';
import { useSessionsStore, getSessionsInRange } from '../stores/sessions-store.ts';
import {
  toDateString,
  getWeekRange,
  subWeeks,
  startOfMonth,
  endOfMonth,
  subMonths,
} from '../utils/date-utils.ts';

type Period = 'week' | 'month' | 'all';

export function StatsPage() {
  const [period, setPeriod] = useState<Period>('week');
  const sessions = useSessionsStore((s) => s.sessions);

  const now = new Date();

  const { currentRange, prevRange } = useMemo(() => {
    if (period === 'week') {
      const { start, end } = getWeekRange(now);
      const prevWeek = subWeeks(now, 1);
      const { start: pStart, end: pEnd } = getWeekRange(prevWeek);
      return {
        currentRange: { from: toDateString(start), to: toDateString(end) },
        prevRange: { from: toDateString(pStart), to: toDateString(pEnd) },
      };
    }
    if (period === 'month') {
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      const prevMonth = subMonths(now, 1);
      const pStart = startOfMonth(prevMonth);
      const pEnd = endOfMonth(prevMonth);
      return {
        currentRange: { from: toDateString(start), to: toDateString(end) },
        prevRange: { from: toDateString(pStart), to: toDateString(pEnd) },
      };
    }
    // all time
    return {
      currentRange: { from: '2000-01-01', to: '2099-12-31' },
      prevRange: null,
    };
  }, [period]);

  const currentSessions = getSessionsInRange(sessions, currentRange.from, currentRange.to);
  const prevSessions = prevRange
    ? getSessionsInRange(sessions, prevRange.from, prevRange.to)
    : [];

  const currentStats = {
    distance: currentSessions.reduce((s, x) => s + x.distanceKm, 0),
    calories: currentSessions.reduce((s, x) => s + x.caloriesBurned, 0),
    steps: currentSessions.reduce((s, x) => s + x.steps, 0),
    sessions: currentSessions.length,
  };

  const prevStats = {
    distance: prevSessions.reduce((s, x) => s + x.distanceKm, 0),
    calories: prevSessions.reduce((s, x) => s + x.caloriesBurned, 0),
    steps: prevSessions.reduce((s, x) => s + x.steps, 0),
    sessions: prevSessions.length,
  };

  const chartData = aggregateByDay(sessions, currentRange.from, currentRange.to);

  const change = (current: number, prev: number): string => {
    if (prev === 0) return current > 0 ? '+100%' : '0%';
    const pct = Math.round(((current - prev) / prev) * 100);
    return pct >= 0 ? `+${String(pct)}%` : `${String(pct)}%`;
  };

  const changeClass = (current: number, prev: number): string => {
    return current >= prev ? 'positive' : 'negative';
  };

  // All-time totals
  const allTimeDistance = sessions.reduce((s, x) => s + x.distanceKm, 0);
  const allTimeCalories = sessions.reduce((s, x) => s + x.caloriesBurned, 0);
  const allTimeSteps = sessions.reduce((s, x) => s + x.steps, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Period selector */}
      <div className="period-selector">
        {(['week', 'month', 'all'] as Period[]).map((p) => (
          <button
            key={p}
            className={`period-btn${period === p ? ' active' : ''}`}
            onClick={() => { setPeriod(p); }}
          >
            {p === 'week' ? 'Tydzien' : p === 'month' ? 'Miesiac' : 'Wszystko'}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid-4">
        <div className="card text-center">
          <div className="stat-label">Dystans</div>
          <div className="stat-value">{currentStats.distance.toFixed(1)} km</div>
          {prevRange && (
            <div className={`stat-change ${changeClass(currentStats.distance, prevStats.distance)}`}>
              {change(currentStats.distance, prevStats.distance)} vs poprzedni
            </div>
          )}
        </div>
        <div className="card text-center">
          <div className="stat-label">Kalorie</div>
          <div className="stat-value">{currentStats.calories.toLocaleString('pl-PL')}</div>
          {prevRange && (
            <div className={`stat-change ${changeClass(currentStats.calories, prevStats.calories)}`}>
              {change(currentStats.calories, prevStats.calories)} vs poprzedni
            </div>
          )}
        </div>
        <div className="card text-center">
          <div className="stat-label">Kroki</div>
          <div className="stat-value">{currentStats.steps.toLocaleString('pl-PL')}</div>
          {prevRange && (
            <div className={`stat-change ${changeClass(currentStats.steps, prevStats.steps)}`}>
              {change(currentStats.steps, prevStats.steps)} vs poprzedni
            </div>
          )}
        </div>
        <div className="card text-center">
          <div className="stat-label">Sesje</div>
          <div className="stat-value">{currentStats.sessions}</div>
          {prevRange && (
            <div className={`stat-change ${changeClass(currentStats.sessions, prevStats.sessions)}`}>
              {change(currentStats.sessions, prevStats.sessions)} vs poprzedni
            </div>
          )}
        </div>
      </div>

      {/* All-time stats */}
      {period !== 'all' && (
        <div className="card">
          <div className="card-title">Lacznie (all-time)</div>
          <div className="grid-4">
            <div className="text-center">
              <div style={{ fontSize: 20, fontWeight: 700 }}>{allTimeDistance.toFixed(1)} km</div>
              <div className="stat-label">dystans</div>
            </div>
            <div className="text-center">
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {allTimeCalories.toLocaleString('pl-PL')}
              </div>
              <div className="stat-label">kcal</div>
            </div>
            <div className="text-center">
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {allTimeSteps.toLocaleString('pl-PL')}
              </div>
              <div className="stat-label">kroki</div>
            </div>
            <div className="text-center">
              <div style={{ fontSize: 20, fontWeight: 700 }}>{sessions.length}</div>
              <div className="stat-label">sesji</div>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      {chartData.length > 0 ? (
        <StatsCharts data={chartData} />
      ) : (
        <div className="card text-center" style={{ padding: 40, color: 'var(--text-muted)' }}>
          Brak danych do wyswietlenia. Zacznij treningi!
        </div>
      )}
    </div>
  );
}
