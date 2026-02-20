import { getWeekDates, toDateString, formatDate, isSameDay } from '../utils/date-utils.ts';
import type { TreadmillSession } from '../types.ts';
import { getSessionsByDate } from '../stores/sessions-store.ts';


interface WeekViewProps {
  date: Date;
  sessions: TreadmillSession[];
  onSelectDate: (date: Date) => void;
}

export function WeekView({ date, sessions, onSelectDate }: WeekViewProps) {
  const weekDates = getWeekDates(date);
  const today = new Date();

  return (
    <div className="week-grid">
      {weekDates.map((d) => {
        const dateStr = toDateString(d);
        const daySessions = getSessionsByDate(sessions, dateStr);
        const isToday = isSameDay(d, today);

        return (
          <div key={dateStr} className="week-day-col">
            <div
              className="week-day-header"
              style={{ cursor: 'pointer' }}
              onClick={() => { onSelectDate(d); }}
            >
              <div className="week-day-name">{formatDate(d, 'EEE')}</div>
              <div className={`week-day-num${isToday ? ' today' : ''}`}>{d.getDate()}</div>
            </div>
            {daySessions.map((s) => (
              <div key={s.id} style={{ fontSize: 12, padding: '4px 6px' }}>
                <div style={{ fontWeight: 600 }}>{s.distanceKm.toFixed(1)} km</div>
                <div style={{ color: 'var(--text-muted)' }}>{s.caloriesBurned} kcal</div>
              </div>
            ))}
            {daySessions.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: 12,
                  color: 'var(--text-muted)',
                  fontSize: 12,
                }}
              >
                -
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
