import { useState, useMemo } from 'react';
import type { CalendarView } from '../types.ts';
import { Calendar } from '../components/Calendar.tsx';
import { WeekView } from '../components/WeekView.tsx';
import { SessionCard } from '../components/SessionCard.tsx';
import { useSessionsStore, getSessionsByDate } from '../stores/sessions-store.ts';
import {
  toDateString,
  formatDate,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addYears,
  subYears,
  addDays,
  subDays,
  getMonthDays,
} from '../utils/date-utils.ts';

const MONTH_NAMES = [
  'Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze',
  'Lip', 'Sie', 'Wrz', 'Paz', 'Lis', 'Gru',
];

export function CalendarPage() {
  const [view, setView] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const sessions = useSessionsStore((s) => s.sessions);

  const sessionDates = useMemo(
    () => new Set(sessions.map((s) => s.date)),
    [sessions],
  );

  const selectedDateStr = toDateString(selectedDate);
  const selectedSessions = getSessionsByDate(sessions, selectedDateStr);

  const navigate = (direction: 1 | -1) => {
    setCurrentDate((d) => {
      if (view === 'day') return direction === 1 ? addDays(d, 1) : subDays(d, 1);
      if (view === 'week') return direction === 1 ? addWeeks(d, 1) : subWeeks(d, 1);
      if (view === 'month') return direction === 1 ? addMonths(d, 1) : subMonths(d, 1);
      return direction === 1 ? addYears(d, 1) : subYears(d, 1);
    });
  };

  const getTitle = (): string => {
    if (view === 'day') return formatDate(currentDate, 'd MMMM yyyy');
    if (view === 'week') return `Tydzien ${formatDate(currentDate, 'w, yyyy')}`;
    if (view === 'month') return formatDate(currentDate, 'LLLL yyyy');
    return formatDate(currentDate, 'yyyy');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* View toggle + nav */}
      <div className="flex items-center justify-between">
        <div className="view-toggle">
          {(['day', 'week', 'month', 'year'] as CalendarView[]).map((v) => (
            <button
              key={v}
              className={v === view ? 'active' : ''}
              onClick={() => { setView(v); }}
            >
              {v === 'day' ? 'Dzien' : v === 'week' ? 'Tydzien' : v === 'month' ? 'Miesiac' : 'Rok'}
            </button>
          ))}
        </div>

        <div className="calendar-nav" style={{ marginBottom: 0 }}>
          <div className="calendar-nav-btns">
            <button className="btn btn-ghost" onClick={() => { navigate(-1); }}>
              ←
            </button>
            <span className="calendar-nav-title" style={{ minWidth: 200, textAlign: 'center' }}>
              {getTitle()}
            </span>
            <button className="btn btn-ghost" onClick={() => { navigate(1); }}>
              →
            </button>
          </div>
        </div>

        <button
          className="btn btn-ghost"
          onClick={() => {
            setCurrentDate(new Date());
            setSelectedDate(new Date());
          }}
        >
          Dzisiaj
        </button>
      </div>

      {/* Calendar views */}
      <div className="card">
        {view === 'month' && (
          <Calendar
            year={currentDate.getFullYear()}
            month={currentDate.getMonth()}
            selectedDate={selectedDate}
            sessionDates={sessionDates}
            onSelectDate={(d) => {
              setSelectedDate(d);
              setCurrentDate(d);
            }}
          />
        )}

        {view === 'week' && (
          <WeekView
            date={currentDate}
            sessions={sessions}
            onSelectDate={(d) => {
              setSelectedDate(d);
              setCurrentDate(d);
            }}
          />
        )}

        {view === 'day' && (
          <div>
            <h3 style={{ marginBottom: 16 }}>{formatDate(currentDate, 'EEEE, d MMMM yyyy')}</h3>
            {getSessionsByDate(sessions, toDateString(currentDate)).length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                Brak sesji w tym dniu
              </div>
            ) : (
              getSessionsByDate(sessions, toDateString(currentDate)).map((s) => (
                <SessionCard key={s.id} session={s} />
              ))
            )}
          </div>
        )}

        {view === 'year' && (
          <YearView
            year={currentDate.getFullYear()}
            sessionDates={sessionDates}
          />
        )}
      </div>

      {/* Selected day sessions (for month view) */}
      {view === 'month' && selectedSessions.length > 0 && (
        <div>
          <div className="card-title mb-8">
            {formatDate(selectedDate, 'd MMMM yyyy')}
          </div>
          {selectedSessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function YearView({
  year,
  sessionDates,
}: {
  year: number;
  sessionDates: Set<string>;
}) {
  return (
    <div className="year-grid">
      {Array.from({ length: 12 }, (_, month) => (
        <MiniMonth key={month} year={year} month={month} sessionDates={sessionDates} />
      ))}
    </div>
  );
}

function MiniMonth({
  year,
  month,
  sessionDates,
}: {
  year: number;
  month: number;
  sessionDates: Set<string>;
}) {
  const days = getMonthDays(year, month);

  return (
    <div>
      <div className="mini-month-title">{MONTH_NAMES[month]}</div>
      <div className="mini-calendar-grid">
        {days.map((date, i) => {
          if (!date) {
            return <div key={`e-${String(i)}`} className="mini-day" />;
          }
          const dateStr = toDateString(date);
          const has = sessionDates.has(dateStr);
          return (
            <div
              key={dateStr}
              className={`mini-day${has ? ' active-2' : ''}`}
            />
          );
        })}
      </div>
    </div>
  );
}
