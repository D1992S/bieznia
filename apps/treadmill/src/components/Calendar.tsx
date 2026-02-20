import { getMonthDays, getWeekDays, toDateString, isSameDay } from '../utils/date-utils.ts';

interface CalendarProps {
  year: number;
  month: number;
  selectedDate: Date;
  sessionDates: Set<string>;
  onSelectDate: (date: Date) => void;
}

export function Calendar({
  year,
  month,
  selectedDate,
  sessionDates,
  onSelectDate,
}: CalendarProps) {
  const days = getMonthDays(year, month);
  const weekDays = getWeekDays();
  const today = new Date();

  return (
    <div className="calendar-grid">
      {weekDays.map((d) => (
        <div key={d} className="calendar-header">
          {d}
        </div>
      ))}
      {days.map((date, i) => {
        if (!date) {
          return <div key={`empty-${String(i)}`} className="calendar-day empty" />;
        }
        const dateStr = toDateString(date);
        const isToday = isSameDay(date, today);
        const isSelected = isSameDay(date, selectedDate);
        const hasSession = sessionDates.has(dateStr);

        return (
          <div
            key={dateStr}
            className={`calendar-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${hasSession ? ' has-session' : ''}`}
            onClick={() => { onSelectDate(date); }}
          >
            {date.getDate()}
          </div>
        );
      })}
    </div>
  );
}
